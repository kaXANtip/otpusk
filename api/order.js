// POST /api/order — приём заказа из мини-приложения

import {
  BOT_TOKEN, ADMIN_CHAT_IDS, send, readBody, loadShop, computeOrder, verifyInitData,
  tg, h, money, chunks, statusKeyboard, webAppButton, baseUrl,
} from './_lib/common.js';

const REPLACE = { call: 'позвонить и согласовать', similar: 'заменить похожим', remove: 'убрать из заказа' };
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

function orderNumber() {
  // 6 цифр: счётчик секунд (повторяется раз в ~10 дней) + случайная добавка — коротко и почти без повторов
  const n = (Math.floor(Date.now() / 1000) % 900000) + 100000;
  return String((n + Math.floor(Math.random() * 7)) % 1000000).padStart(6, '1');
}

function mapLink(a) {
  if (!a.lat || !a.lon) return '';
  return `https://yandex.ru/maps/?pt=${Number(a.lon)},${Number(a.lat)}&z=17&l=map`;
}

function phonePretty(d) {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length !== 11) return s;
  return `+${s[0]} ${s.slice(1, 4)} ${s.slice(4, 7)}-${s.slice(7, 9)}-${s.slice(9)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Метод не поддерживается' });
  let data;
  try {
    data = await loadShop(req);
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: 'Каталог недоступен. Попробуйте позже' });
  }
  const body = readBody(req);
  const auth = verifyInitData(body.initData);
  if (auth.status === 'invalid') return send(res, 401, { ok: false, error: 'Не удалось подтвердить данные Telegram. Перезапустите приложение' });

  const calc = computeOrder(data, body.items, body.promo);
  if (calc.error) return send(res, 400, { ok: false, error: calc.error });
  if (calc.missing.length) {
    return send(res, 409, { ok: false, error: 'Некоторых товаров больше нет в продаже — мы убрали их из корзины. Проверьте заказ ещё раз', missing: calc.missing });
  }
  const { shop } = data;
  if (calc.subtotal < (shop.minOrder || 0)) return send(res, 400, { ok: false, error: `Минимальная сумма заказа — ${money(shop.minOrder)}` });

  // проверка полей
  const a = body.address || {};
  const street = clip(a.street, 160);
  const name = clip(body.contact?.name, 80);
  const phone = String(body.contact?.phone || '').replace(/\D/g, '').slice(0, 15);
  if (street.length < 3) return send(res, 400, { ok: false, error: 'Укажите адрес доставки' });
  if (!name) return send(res, 400, { ok: false, error: 'Укажите имя получателя' });
  if (phone.length < 10) return send(res, 400, { ok: false, error: 'Укажите телефон для связи' });
  const city = clip(a.city, 60);
  if (shop.cities?.length && city && !shop.cities.includes(city)) return send(res, 400, { ok: false, error: 'По этому адресу мы пока не доставляем' });

  const id = orderNumber();
  const user = auth.status === 'ok' || auth.status === 'expired' ? auth.user : null;
  const pay = (shop.payments || []).find((p) => p.id === body.payment?.id);

  // ---------- сообщение оператору
  const addrParts = [city, street];
  if (!a.house) {
    if (a.flat) addrParts.push(`кв. ${clip(a.flat, 12)}`);
    if (a.entrance) addrParts.push(`подъезд ${clip(a.entrance, 6)}`);
    if (a.floor) addrParts.push(`этаж ${clip(a.floor, 6)}`);
    if (a.intercom) addrParts.push(`домофон ${clip(a.intercom, 16)}`);
  } else addrParts.push('частный дом');
  const map = mapLink(a);
  const who = user
    ? `${user.username ? `@${h(user.username)}` : `<a href="tg://user?id=${Number(user.id)}">${h([user.first_name, user.last_name].filter(Boolean).join(' '))}</a>`}`
    : '⚠️ вне Telegram';

  // null — строка не нужна, '' — пустая строка-разделитель
  const lines = [
    `🛒 <b>Новый заказ №${id}</b>`,
    '',
    `👤 ${h(name)} · <b>${h(phonePretty(phone))}</b> · ${who}${user?.id ? ` · #u${Number(user.id)}` : ''}`,
    `📍 ${h(addrParts.filter(Boolean).join(', '))}${map ? ` · <a href="${map}">на карте</a>` : ''}`,
    a.comment ? `💬 Курьеру: ${h(clip(a.comment, 300))}` : null,
    `🕐 ${h(clip(body.when?.label, 80) || 'Как можно скорее')}`,
    `💳 ${h(pay?.title || 'Оплата при получении')}${body.payment?.id === 'cash' && body.payment?.change ? `, сдача с ${h(clip(body.payment.change, 12))} ₽` : ''}`,
    body.door ? '🚪 Оставить у двери' : null,
    `🔁 Если товара нет: ${REPLACE[body.replace] || REPLACE.call}`,
    body.comment ? `📝 ${h(clip(body.comment, 500))}` : null,
    auth.status === 'absent' && BOT_TOKEN ? '⚠️ Заказ без подписи Telegram — перезвоните для подтверждения' : null,
    '',
    `<b>Состав (${calc.count} шт.):</b>`,
    ...calc.lines.map((l, i) => `${i + 1}. ${h(l.p.n)}${l.p.w ? `, ${h(l.p.w)}` : ''} — ${l.qty} × ${money(l.p.p)} = <b>${money(l.sum)}</b>`),
    '',
    `Товары: ${money(calc.subtotal)}`,
    `Доставка: ${calc.fee ? money(calc.fee) : 'бесплатно'}`,
    calc.discount ? `Промокод ${h(calc.promo.code)}: −${money(calc.discount)}` : null,
    `<b>Итого: ${money(calc.total)}</b>`,
  ].filter((x) => x !== null);

  // ---------- без бота: тестовый режим, чтобы можно было проверить приложение
  if (!BOT_TOKEN || !ADMIN_CHAT_IDS.length) {
    console.log('[demo order]\n' + lines.join('\n').replace(/<[^>]+>/g, ''));
    return send(res, 200, { ok: true, demo: true, orderId: id, subtotal: calc.subtotal, fee: calc.fee, discount: calc.discount, total: calc.total });
  }

  const parts = chunks(lines.join('\n'));
  let delivered = 0;
  for (const chat of ADMIN_CHAT_IDS) {
    let okChat = true;
    for (let i = 0; i < parts.length; i++) {
      const r = await tg('sendMessage', {
        chat_id: chat,
        text: parts[i],
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(i === 0 ? { reply_markup: statusKeyboard('new', id, user?.id) } : {}),
      });
      if (!r.ok) okChat = false;
    }
    if (okChat) delivered++;
  }
  if (!delivered) {
    return send(res, 502, { ok: false, error: 'Не получилось передать заказ оператору. Попробуйте ещё раз через минуту' });
  }

  // ---------- подтверждение покупателю
  let notified = false;
  if (user?.id) {
    const r = await tg('sendMessage', {
      chat_id: user.id,
      parse_mode: 'HTML',
      text: [
        `🌴 <b>Спасибо! Заказ №${id} оформлен</b>`,
        '',
        `🕐 ${h(clip(body.when?.label, 80))}`,
        `📍 ${h(street)}`,
        `💳 ${h(pay?.title || 'Оплата при получении')} · <b>${money(calc.total)}</b>`,
        '',
        'Напишем сюда, когда заказ примут и когда курьер выедет.',
      ].join('\n'),
      reply_markup: webAppButton(baseUrl(req), '🛒 Открыть магазин'),
    });
    notified = !!r.ok;
  }

  return send(res, 200, { ok: true, orderId: id, subtotal: calc.subtotal, fee: calc.fee, discount: calc.discount, total: calc.total, notified });
}
