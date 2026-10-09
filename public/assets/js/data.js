// Каталог, настройки магазина, поиск и расписание доставки

import { norm, money } from './util.js';

export let shop = null;
export let categories = [];
export let products = [];
export const byId = new Map();
export const catsById = new Map();
export const subsById = new Map();
export const productsByCat = new Map();
export const productsBySub = new Map();
let catalogVersion = '';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export async function loadData() {
  const [cat, cfg] = await Promise.all([getJSON('/data/catalog.json'), getJSON('/data/shop.json')]);
  shop = cfg;
  catalogVersion = cat.version;
  categories = cat.categories;
  products = cat.products;
  for (const c of categories) {
    catsById.set(c.id, c);
    productsByCat.set(c.id, []);
    for (const s of c.subs) {
      subsById.set(s.id, { ...s, cat: c.id });
      productsBySub.set(s.id, []);
    }
  }
  for (const p of products) {
    byId.set(p.id, p);
    productsByCat.get(p.c)?.push(p);
    productsBySub.get(p.s)?.push(p);
  }
  buildIndex();
}

export const version = () => catalogVersion;

// ---------------------------------------------------------------- товар
export const catOf = (p) => catsById.get(p.c);
export const subOf = (p) => subsById.get(p.s);
export const emojiOf = (p) => subOf(p)?.emoji || catOf(p)?.emoji || '🛒';
export const toneOf = (p) => catOf(p)?.tone || 'mint';

export function unitPrice(p) {
  if (!p.q || !p.u) return '';
  if (p.u === 'г' && p.q !== 1000) return `${money((p.p / p.q) * 1000)}/кг`;
  if (p.u === 'мл' && p.q !== 1000) return `${money((p.p / p.q) * 1000)}/л`;
  if (p.u === 'шт' && p.q > 1) return `${money(p.p / p.q)}/шт`;
  return '';
}

/** Витрина категории: разные подкатегории по кругу */
export const sampleCategory = (catId, n = 14) => diverse(productsByCat.get(catId) || [], n);

/** Перемешать список по подкатегориям: молоко, хлеб, сосиски… вместо 14 видов молока подряд */
export function diverse(items, n = 14, exclude = new Set()) {
  const bySub = new Map();
  for (const p of items) {
    if (exclude.has(p.id)) continue;
    if (!bySub.has(p.s)) bySub.set(p.s, []);
    bySub.get(p.s).push(p);
  }
  const lists = [...bySub.values()];
  const out = [];
  for (let i = 0; out.length < n; i++) {
    let added = false;
    for (const list of lists) {
      if (list[i]) {
        out.push(list[i]);
        added = true;
        if (out.length >= n) break;
      }
    }
    if (!added) break;
  }
  return out;
}

export function countLabel(catId) {
  return productsByCat.get(catId)?.length || 0;
}

// ---------------------------------------------------------------- подборки
export function collection(id) {
  const c = shop.collections.find((x) => x.id === id);
  if (!c) return null;
  let items;
  let groupBy = 'sub';
  if (c.flag) {
    items = products.filter((p) => p[c.flag]);
    groupBy = 'cat';
  } else if (c.cats) {
    items = products.filter((p) => c.cats.includes(p.c));
  } else if (c.subs) {
    const order = new Map(c.subs.map((s, i) => [norm(s), i]));
    items = products.filter((p) => order.has(norm(subOf(p)?.name)));
    items.sort((a, b) => order.get(norm(subOf(a).name)) - order.get(norm(subOf(b).name)));
  } else items = [];
  return { ...c, items, groupBy };
}

export function groupItems(items, by = 'sub') {
  const groups = new Map();
  for (const p of items) {
    const key = by === 'cat' ? p.c : p.s;
    if (!groups.has(key)) {
      const meta = by === 'cat' ? catsById.get(key) : subsById.get(key);
      groups.set(key, { id: key, name: by === 'cat' ? meta?.title : meta?.name, items: [] });
    }
    groups.get(key).items.push(p);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- поиск
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const LAYOUT = new Map([...EN].map((ch, i) => [ch, RU[i]]));
export function fixLayout(s) {
  return [...s.toLowerCase()].map((ch) => LAYOUT.get(ch) ?? ch).join('');
}

const ENDINGS = ['ями', 'ами', 'ого', 'ему', 'ыми', 'ими', 'ией', 'ия', 'ие', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ых', 'их', 'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ей', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь'];
function stem(t) {
  if (t.length < 4 || /\d/.test(t)) return t;
  for (const e of ENDINGS) if (t.endsWith(e) && t.length - e.length >= 3) return t.slice(0, -e.length);
  return t;
}

// разговорные слова → как в каталоге
const SYN = {
  минералка: 'минеральн', газировка: 'газ', шоколадка: 'шоколад', мороженка: 'морожен', пельмешки: 'пельмен',
  колбаска: 'колбас', сосиска: 'сосиск', сардельки: 'сардельк', кока: 'кола', пепси: 'pepsi', кофе: 'кофе',
  котов: 'кош', кота: 'кош', коту: 'кош', кошке: 'кош', собаке: 'собак', псу: 'собак', детям: 'детск',
  памперсы: 'подгузн', памперс: 'подгузн', гречка: 'гречн', греча: 'гречн', макарошки: 'макарон', сок: 'сок',
  йогурт: 'йогурт', бутер: 'хлеб', хлебушек: 'хлеб', булка: 'булк', водичка: 'вода', лимонад: 'лимонад',
};

let index = [];
function buildIndex() {
  index = products.map((p) => {
    const name = norm(p.n);
    const brand = norm(p.b);
    const sub = norm(subOf(p)?.name);
    const cat = norm(catOf(p)?.title);
    return {
      p,
      name: name.split(' '),
      brand: brand.split(' ').filter(Boolean),
      rest: (sub + ' ' + cat).split(' ').filter(Boolean),
      first: name.split(' ')[0] || '',
    };
  });
}

function lev1(a, b) {
  // расстояние Левенштейна ≤ 1 (быстрая проверка)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function matchWord(words, t, fuzzy) {
  for (const w of words) {
    if (w.startsWith(t)) return 2;
    if (t.length >= 3 && w.includes(t)) return 1;
    if (fuzzy && t.length >= 4 && (lev1(t, w.slice(0, t.length)) || lev1(t, w.slice(0, t.length + 1)))) return 0.6;
  }
  return 0;
}

function run(tokens, fuzzy) {
  const res = [];
  for (const it of index) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const n = matchWord(it.name, t, fuzzy);
      const b = n ? 0 : matchWord(it.brand, t, fuzzy);
      const r = n || b ? 0 : matchWord(it.rest, t, fuzzy);
      if (!n && !b && !r) {
        ok = false;
        break;
      }
      score += n * 3 + b * 2 + r;
      if (it.first.startsWith(t)) score += 3;
    }
    if (ok) res.push({ p: it.p, score: score + (it.p.a ? 0.3 : 0) });
  }
  res.sort((a, b) => b.score - a.score || a.p.n.length - b.p.n.length);
  return res.map((r) => r.p);
}

/** Поиск: стемминг, синонимы, неверная раскладка, одна опечатка */
export function search(query) {
  const q = norm(query);
  if (!q) return { items: [], used: '' };
  const toTokens = (s) => s.split(' ').filter(Boolean).map((t) => SYN[t] || stem(t));
  let items = run(toTokens(q), false);
  let used = '';
  if (!items.length && /[a-z]/.test(q)) {
    const fixed = norm(fixLayout(q));
    items = run(toTokens(fixed), false);
    if (items.length) used = fixed;
  }
  if (!items.length) items = run(toTokens(used || q), true);
  return { items, used };
}

/** Подкатегории, подходящие под запрос, — быстрые переходы над результатами */
export function searchSubs(query, items) {
  const counts = new Map();
  for (const p of items.slice(0, 200)) counts.set(p.s, (counts.get(p.s) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, n]) => ({ ...subsById.get(id), n }));
}

// ---------------------------------------------------------------- время работы и слоты
function nowParts() {
  const tz = shop.timezone || 'Europe/Moscow';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), min: d.getHours() * 60 + d.getMinutes() };
  }
  const g = (t) => Number(parts.find((x) => x.type === t)?.value);
  return { y: g('year'), m: g('month'), d: g('day'), min: (g('hour') % 24) * 60 + g('minute') };
}

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function openState() {
  const now = nowParts().min;
  const open = toMin(shop.hours.open);
  const close = toMin(shop.hours.close);
  const asap = now >= open && now <= close - 30;
  return { asap, open: shop.hours.open, close: shop.hours.close, beforeOpen: now < open };
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function deliveryDays() {
  const n = nowParts();
  const open = toMin(shop.hours.open);
  const close = toMin(shop.hours.close);
  const step = Math.max(1, shop.slotHours || 2) * 60;
  const days = [];
  for (let off = 0; off < Math.max(1, shop.daysAhead || 2) + 1 && days.length < (shop.daysAhead || 2); off++) {
    const date = new Date(Date.UTC(n.y, n.m - 1, n.d + off));
    const iso = date.toISOString().slice(0, 10);
    const slots = [];
    for (let s = open; s < close; s += step) {
      const e = Math.min(s + step, close);
      if (off === 0 && s < n.min + 60) continue;
      slots.push({ from: toHHMM(s), to: toHHMM(e), label: `${toHHMM(s)}–${toHHMM(e)}` });
    }
    if (!slots.length) continue;
    const title = off === 0 ? 'Сегодня' : off === 1 ? 'Завтра' : 'Послезавтра';
    days.push({ iso, title, date: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`, slots });
  }
  return days;
}

export function deliveryFee(subtotal) {
  const tiers = [...(shop.delivery || [])].sort((a, b) => a.from - b.from);
  let fee = tiers[0]?.fee ?? 0;
  for (const t of tiers) if (subtotal >= t.from) fee = t.fee;
  return fee;
}

/** Следующий порог, после которого доставка дешевле */
export function nextTier(subtotal) {
  const cur = deliveryFee(subtotal);
  const tiers = [...(shop.delivery || [])].sort((a, b) => a.from - b.from);
  const t = tiers.find((x) => x.from > subtotal && x.fee < cur);
  if (!t) return null;
  const prev = [...tiers].reverse().find((x) => x.from <= subtotal);
  return { need: t.from - subtotal, fee: t.fee, from: t.from, base: prev?.from || 0 };
}

export const freeFrom = () => {
  const t = (shop.delivery || []).find((x) => x.fee === 0);
  return t ? t.from : null;
};
