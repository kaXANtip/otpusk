#!/usr/bin/env python3
"""
Собирает каталог для мини-приложения из Excel-таблицы.

    python tools/build_catalog.py "D:/OTPUSK/Таблича.xlsx"

Без аргумента ищет «Таблича.xlsx» рядом с папкой проекта.
Результат: public/data/catalog.json (его читают и витрина, и сервер заказов).

Работает на чистом Python 3 — никаких pip install не нужно.

Какие столбцы понимает (ищутся по заголовку, порядок не важен):
  Категория, Подкатегория, Название товара, Бренд, Объём / вес / шт,
  Цена у источника, Наша цена продажи (если заполнена — берётся она),
  Ценовой тип («Якорный» → бейдж «Выгодно»).
Необязательные столбцы, которые можно добавить позже:
  Фото (ссылка или путь вида /img/products/xxx.webp), Старая цена,
  Описание, Наличие (нет / 0 / false → товар скрыт).
"""
import hashlib
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data', 'catalog.json')
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# ---------------------------------------------------------------- оформление
# Ключ — название категории из таблицы (без учёта регистра).
# id — для ссылок, title — заголовок экрана, short — подпись плитки на главной,
# tone — цвет фона плитки и заглушек фото (см. --tone-* в app.css).
CATEGORY_META = {
    'молочные продукты и яйца': dict(id='dairy', title='Молочные продукты и яйца', short='Молочное', emoji='🥛', tone='blue'),
    'хлеб и выпечка': dict(id='bakery', title='Хлеб и выпечка', short='Хлеб и выпечка', emoji='🥖', tone='amber'),
    'мясо': dict(id='meat', title='Мясо и колбасы', short='Мясо и колбасы', emoji='🥩', tone='rose'),
    'птица': dict(id='poultry', title='Птица', short='Птица', emoji='🍗', tone='orange'),
    'рыба': dict(id='fish', title='Рыба и морепродукты', short='Рыба', emoji='🐟', tone='sky'),
    'заморозка': dict(id='frozen', title='Заморозка и мороженое', short='Заморозка', emoji='🍦', tone='ice'),
    'снеки и сладости': dict(id='snacks', title='Снеки и сладости', short='Снеки и сладости', emoji='🍫', tone='pink'),
    'бакалея': dict(id='grocery', title='Бакалея', short='Бакалея', emoji='🍝', tone='yellow'),
    'напитки (безалкогольные)': dict(id='drinks', title='Напитки', short='Напитки', emoji='🧃', tone='lime'),
    'детские товары': dict(id='kids', title='Детские товары', short='Детям', emoji='🧸', tone='violet'),
    'личная гигиена и косметика': dict(id='care', title='Гигиена и уход', short='Гигиена', emoji='🧴', tone='mint'),
    'зоотовары': dict(id='pets', title='Зоотовары', short='Зоотовары', emoji='🐾', tone='sand'),
}
FALLBACK_TONES = ['blue', 'amber', 'rose', 'mint', 'violet', 'sky', 'yellow', 'pink']

# Подкатегория из таблицы → (красивое название, эмодзи для заглушки фото)
SUB_META = {
    'молоко': ('Молоко', '🥛'), 'кефир': ('Кефир', '🥛'),
    'хлеб': ('Хлеб', '🍞'), 'лаваш': ('Лаваш', '🫓'), 'батон': ('Батоны', '🥖'), 'булочка': ('Булочки и пирожки', '🥐'),
    'фарш свиной': ('Фарш свиной', '🥩'), 'свинина': ('Свинина', '🥩'),
    'колбаса вар.': ('Варёная колбаса', '🍖'), 'колбаса копч.': ('Копчёная колбаса', '🍖'),
    'колбаса сырокопч.': ('Сырокопчёная колбаса', '🍖'), 'нарезка': ('Нарезка', '🥓'), 'бекон': ('Бекон', '🥓'),
    'сосиски': ('Сосиски и сардельки', '🌭'),
    'фарш куриный': ('Фарш куриный', '🍗'), 'курица': ('Курица', '🍗'),
    'рыба': ('Рыба', '🐟'), 'креветка': ('Креветки', '🦐'),
    'овощи': ('Овощи и смеси', '🥦'), 'пицца': ('Пицца', '🍕'), 'тесто': ('Тесто', '🥧'),
    'вареники': ('Вареники', '🥟'), 'пельмени': ('Пельмени', '🥟'), 'наггетсы': ('Наггетсы', '🍗'),
    'крылышки': ('Крылышки', '🍗'), 'чебупицца': ('Чебупицца', '🍕'), 'фрук.лёд': ('Фруктовый лёд', '🍧'),
    'рожок': ('Рожки', '🍦'), 'эскимо': ('Эскимо', '🍫'), 'стаканчик': ('Стаканчики', '🍨'),
    'бол.упак.': ('Мороженое в больших упаковках', '🍨'),
    'орехи': ('Орехи', '🥜'), 'попкорн': ('Попкорн', '🍿'), 'семечки': ('Семечки', '🌻'),
    'сухарики': ('Сухарики', '🥖'), 'чипсы': ('Чипсы', '🥔'), 'нутелла': ('Шоколадная паста', '🍫'),
    'крекеры': ('Крекеры', '🥨'), 'конфеты': ('Конфеты', '🍬'), 'батончики': ('Батончики', '🍫'),
    'кексы': ('Кексы и рулеты', '🧁'), 'мармелад': ('Мармелад', '🍬'), 'вафли': ('Вафли', '🧇'),
    'драже': ('Драже и жвачка', '🍭'),
    'сахар': ('Сахар', '🍯'), 'соль': ('Соль', '🧂'), 'сода': ('Сода', '🧂'), 'мука': ('Мука', '🌾'),
    'кетчуп': ('Кетчуп', '🍅'), 'майонез': ('Майонез', '🥚'), 'макароны': ('Макароны', '🍝'),
    'крупы': ('Крупы', '🍚'), 'масло раст': ('Растительное масло', '🫒'), 'уксус': ('Уксус', '🍶'),
    'приправа': ('Специи и приправы', '🌶️'), 'соусы': ('Соусы', '🥫'), 'сухие завтраки': ('Сухие завтраки', '🥣'),
    'сгущенка': ('Сгущёнка', '🥛'), 'рыба консерва': ('Рыбные консервы', '🐟'),
    'овощи консерва': ('Овощные консервы', '🥫'), 'мясо консерва': ('Мясные консервы и паштеты', '🥫'),
    'чай пирамидки': ('Чай в пирамидках', '🍵'), 'чай листовой': ('Листовой чай', '🍵'),
    'чай пакетики': ('Чай в пакетиках', '🍵'), 'какао': ('Какао', '☕'), 'энергетик': ('Энергетики', '⚡'),
    'чай холодный': ('Холодный чай', '🧋'), 'газировка': ('Газировка и лимонады', '🥤'),
    'вода': ('Вода', '💧'), 'сок': ('Соки и нектары', '🧃'),
    'подгузники': ('Подгузники', '👶'), 'пеленки': ('Пелёнки', '👶'), 'салфетки': ('Влажные салфетки', '🧻'),
    'вода детская': ('Детская вода', '💧'), 'питание': ('Детское питание', '🍼'), 'сок детский': ('Детские соки', '🧃'),
    'печенье': ('Детское печенье', '🍪'), 'смесь': ('Детские смеси', '🍼'),
    'гигиена полости рта': ('Уход за полостью рта', '🪥'), 'дезодорант': ('Дезодоранты', '🧴'),
    'мыло твердое': ('Мыло', '🧼'), 'шампунь': ('Шампуни', '🧴'),
    'прокладки ежедневки': ('Ежедневные прокладки', '🌸'), 'прокладки': ('Прокладки', '🌸'),
    'наполнитель': ('Наполнители', '🐾'), 'корм для собак': ('Корм для собак', '🐶'), 'корм для кошек': ('Корм для кошек', '🐱'),
}

# Подкатегории, где вес в таблице на самом деле объём (вода «1000г» = 1 л)
LIQUID_SUBS = {'молоко', 'кефир', 'вода', 'сок', 'газировка', 'чай холодный', 'энергетик', 'вода детская',
               'сок детский', 'масло раст', 'уксус', 'шампунь'}

# Местные бренды для подборки «Сделано в Крыму» (плюс всё, где в названии есть «Крым»)
LOCAL_BRANDS = {'джанкойское молоко'}


# ---------------------------------------------------------------- чтение xlsx
def col_index(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si'):
            strings.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    first = wb.find(NS + 'sheets')[0]
    rid = first.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    target = next(r.get('Target') for r in rels if r.get('Id') == rid)
    sheet_path = 'xl/' + target.lstrip('/').replace('xl/', '', 1)
    sheet = ET.fromstring(z.read(sheet_path))
    rows = []
    for row in sheet.find(NS + 'sheetData').findall(NS + 'row'):
        cells = {}
        for c in row.findall(NS + 'c'):
            t, v = c.get('t'), c.find(NS + 'v')
            if t == 's' and v is not None:
                val = strings[int(v.text)]
            elif t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(NS + 't'))
            else:
                val = v.text if v is not None else None
            cells[col_index(c.get('r'))] = val
        if cells:
            rows.append([cells.get(i) for i in range(max(cells) + 1)])
    return rows


# ---------------------------------------------------------------- нормализация
def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('ё', 'е').replace('Ё', 'Е')).strip().lower()


def clean_name(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    if len(s) > 1 and s[0] == s[-1] == '"':
        s = s[1:-1].strip()
    s = s.replace('""', '"')
    s = re.sub(r'"([^"]+)"', r'«\1»', s)
    s = s.replace('"', '')
    s = re.sub(r'(?<![А-Яа-яA-Za-z])ТМ\s+', '', s)
    s = re.sub(r'\s+([,.])', r'\1', s)
    s = re.sub(r'\s{2,}', ' ', s).strip(' ,')
    return s[:1].upper() + s[1:]


def to_number(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(',', '.').replace(' ', '').replace('\u00a0', ''))
    except ValueError:
        return None


UNIT_RE = r'(\d+(?:[.,]\d+)?)\s*(кг|гр|г|мл|л|шт)\.?(?![а-яa-z])'


def parse_amount(text):
    m = re.fullmatch(r'\s*' + UNIT_RE + r'\s*', (text or '').lower())
    return to_units(m) if m else None


def to_units(m):
    val, unit = to_number(m.group(1)), m.group(2)
    if not val:
        return None
    if unit == 'кг':
        return val * 1000, 'г'
    if unit == 'гр':
        return val, 'г'
    if unit == 'л':
        return val * 1000, 'мл'
    return val, unit


def amount_from_name(name, units):
    for m in re.finditer(UNIT_RE, name.lower()):
        r = to_units(m)
        if r and r[1] in units:
            return r
    return None


def compact(x):
    x = round(x, 2)
    return int(x) if x == int(x) else x


def fmt_num(x):
    x = round(x, 2)
    return (str(int(x)) if x == int(x) else ('%g' % x)).replace('.', ',')


def fmt_amount(val, unit):
    if unit == 'г' and val >= 1000:
        return fmt_num(val / 1000) + ' кг'
    if unit == 'мл' and val >= 1000:
        return fmt_num(val / 1000) + ' л'
    return fmt_num(val) + ' ' + unit


def find_col(header, *keys, default=None):
    h = [norm(x) for x in header]
    for k in keys:
        for i, x in enumerate(h):
            if x.startswith(k):
                return i
    return default


# ---------------------------------------------------------------- сборка
def build(xlsx):
    rows = read_xlsx(xlsx)
    hi = next(i for i, r in enumerate(rows) if r and norm(r[0]) == 'категория')
    header = rows[hi]
    C = dict(
        cat=find_col(header, 'категория', default=0),
        sub=find_col(header, 'подкатегория', default=1),
        name=find_col(header, 'название', default=2),
        brand=find_col(header, 'бренд', default=3),
        amount=find_col(header, 'объём', 'объем', 'вес', default=4),
        src_price=find_col(header, 'цена у источника', default=6),
        our_price=find_col(header, 'наша цена продажи', default=8),
        price_type=find_col(header, 'ценовой тип', default=10),
        photo=find_col(header, 'фото', 'изображение', 'картинка'),
        old_price=find_col(header, 'старая цена'),
        desc=find_col(header, 'описание'),
        stock=find_col(header, 'наличие', 'в наличии'),
    )

    def cell(r, key):
        i = C[key]
        if i is None or i >= len(r):
            return None
        v = r[i]
        return v.strip() if isinstance(v, str) else v

    warnings = []
    # бренды: убираем пробелы и приводим разные написания к самому частому
    brand_forms = Counter()
    for r in rows[hi + 1:]:
        b = (cell(r, 'brand') or '').strip()
        if b:
            brand_forms[b] += 1
    brand_canon = {}
    for b, _ in brand_forms.most_common():
        brand_canon.setdefault(norm(b), b)

    categories = OrderedDict()
    products, seen = [], set()
    tone_i = 0
    for rn, r in enumerate(rows[hi + 1:], start=hi + 2):
        name_raw, cat_raw = cell(r, 'name'), cell(r, 'cat')
        if not name_raw or not cat_raw:
            continue
        price = to_number(cell(r, 'our_price')) or to_number(cell(r, 'src_price'))
        if not price or price <= 0:
            warnings.append(f'строка {rn}: нет цены — «{name_raw}» пропущен')
            continue
        stock = norm(str(cell(r, 'stock') or ''))
        if stock in ('нет', '0', 'false', 'нет в наличии'):
            continue

        ck = norm(cat_raw)
        meta = CATEGORY_META.get(ck)
        if not meta:
            meta = dict(id='c%d' % (len(categories) + 1), title=cat_raw.strip().capitalize(),
                        short=cat_raw.strip().capitalize(), emoji='🛒', tone=FALLBACK_TONES[tone_i % len(FALLBACK_TONES)])
            CATEGORY_META[ck] = meta
            tone_i += 1
        cat = categories.setdefault(meta['id'], dict(meta, subs=OrderedDict()))

        sub_raw = (cell(r, 'sub') or 'Разное').strip()
        sk = norm(sub_raw)
        sub_title, sub_emoji = SUB_META.get(sk, (sub_raw[:1].upper() + sub_raw[1:], meta['emoji']))
        sub_id = meta['id'] + '-' + hashlib.md5(sk.encode()).hexdigest()[:5]
        cat['subs'].setdefault(sub_id, dict(id=sub_id, name=sub_title, emoji=sub_emoji))

        name = clean_name(name_raw)
        amount_txt = str(cell(r, 'amount') or '')
        amount = parse_amount(amount_txt)
        if amount_txt.strip() and not amount:
            warnings.append(f'строка {rn}: непонятный объём «{amount_txt}» у «{name_raw}» — не показываем')
        vol = amount_from_name(name, ('мл',))
        if vol and (sk in LIQUID_SUBS or not amount):
            amount = vol
        elif amount and amount[1] == 'г' and sk in LIQUID_SUBS:
            amount = (amount[0], 'мл')
        if not amount:
            amount = amount_from_name(name, ('шт', 'г'))

        brand = (cell(r, 'brand') or '').strip()
        brand = '' if brand in ('-', '—') or norm(brand) in (norm(sub_raw), norm(cat_raw)) else brand_canon.get(norm(brand), brand)

        w = fmt_amount(*amount) if amount else ''
        key = (norm(name), w)
        if key in seen:
            continue
        seen.add(key)

        pid = hashlib.md5(f'{meta["id"]}|{norm(name)}|{w}'.encode()).hexdigest()[:8]
        p = OrderedDict(id=pid, c=meta['id'], s=sub_id, n=name, p=compact(price))
        if brand:
            p['b'] = brand
        if w:
            p['w'] = w
            p['q'] = compact(amount[0])
            p['u'] = amount[1]
        if norm(cell(r, 'price_type') or '') == 'якорный':
            p['a'] = 1
        if 'крым' in norm(name) or 'крым' in norm(brand) or norm(brand) in LOCAL_BRANDS:
            p['l'] = 1
        old = to_number(cell(r, 'old_price'))
        if old and old > price:
            p['o'] = compact(old)
        photo = cell(r, 'photo')
        if photo:
            p['img'] = str(photo)
        desc = cell(r, 'desc')
        if desc:
            p['d'] = str(desc)
        products.append(p)

    cats_out = []
    for c in categories.values():
        subs = list(c.pop('subs').values())
        c['subs'] = subs
        cats_out.append(c)

    data = OrderedDict(
        version=datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'),
        categories=cats_out,
        products=products,
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print(f'Готово: {len(products)} товаров, {len(cats_out)} категорий → {os.path.relpath(OUT, ROOT)}')
    print(f'Размер файла: {os.path.getsize(OUT) // 1024} КБ')
    for w_ in warnings:
        print('  ! ' + w_)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'Таблича.xlsx')
    if not os.path.exists(src):
        sys.exit(f'Не найден файл таблицы: {src}')
    build(src)
