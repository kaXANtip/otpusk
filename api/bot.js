// POST /api/bot — webhook Telegram-бота:
//  • /start — приветствие с кнопкой магазина
//  • /id — показать ID чата (для настройки ADMIN_CHAT_ID)
//  • кнопки статусов под заказом (Принять → В пути → Доставлен / Отменить) + уведомление клиенту
//  • сообщения клиента пересылаются операторам; ответ оператора (reply) уходит клиенту

import {
  BOT_TOKEN, ADMIN_CHAT_IDS, send, readBody, tg, h, baseUrl, webhookSecret, webAppButton, STATUS, statusKeyboard, loadShop,
} from './_lib/common.js';

const isAdminChat = (id) => ADMIN_CHAT_IDS.includes(String(id));

async function welcome(chatId, firstName, url, eta) {
  const caption = [
    `Привет${firstName ? `, ${h(firstName)}` : ''}! 🌴`,
    '',
    '<b>«Отпуск»</b> — доставка продуктов по Крыму.',
    `Молоко, хлеб, мясо, заморозка, снеки и напитки — привезём за ${h(eta)} или ко времени.`,
    '',
    'Жмите кнопку ниже, чтобы открыть магазин 👇',
  ].join('\n');
  const markup = webAppButton(url);
  const r = await tg('sendPhoto', { chat_id: chatId, photo: `${url}/assets/img/bot-cover.png`, caption, parse_mode: 'HTML', reply_markup: markup });
  if (!r.ok) await tg('sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup: markup });
}

/** Клиент написал боту — передаём операторам */
async function relayToAdmins(msg, url) {
  const u = msg.from || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
  const head = `💬 <b>Сообщение от клиента</b>\n${h(name)}${u.username ? ` @${h(u.username)}` : ''} · #u${u.id}\n\n`;
  const hint = '\n\n<i>Ответьте на это сообщение (reply) — бот перешлёт ответ клиенту.</i>';
  let delivered = 0;
  for (const chat of ADMIN_CHAT_IDS) {
    if (msg.text) {
      const r = await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: head + h(msg.text) + hint });
      if (r.ok) delivered++;
    } else {
      const r = await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: head + '(вложение ниже)' + hint });
      if (r.ok) {
        delivered++;
        await tg('copyMessage', { chat_id: chat, from_chat_id: msg.chat.id, message_id: msg.message_id, reply_parameters: { message_id: r.result.message_id } });
      }
    }
  }
  return tg('sendMessage', {
    chat_id: msg.chat.id,
    text: delivered
      ? 'Передали ваше сообщение оператору — ответим здесь же 🙌'
      : 'Собрать заказ проще всего в магазине — кнопка ниже 👇',
    reply_markup: webAppButton(url),
  });
}

/** Оператор ответил (reply) на сообщение клиента или на заказ — отправляем клиенту */
async function relayToCustomer(msg) {
  const src = msg.reply_to_message;
  const tag = String(src?.text || src?.caption || '').match(/#u(\d{3,})/);
  if (!tag) return;
  const userId = Number(tag[1]);
  let r;
  if (msg.text) r = await tg('sendMessage', { chat_id: userId, text: `💬 Оператор «Отпуска»:\n${msg.text}` });
  else r = await tg('copyMessage', { chat_id: userId, from_chat_id: msg.chat.id, message_id: msg.message_id });
  await tg('sendMessage', {
    chat_id: msg.chat.id,
    reply_parameters: { message_id: msg.message_id },
    text: r.ok ? '✓ Отправлено клиенту' : '✗ Не удалось отправить: клиент, возможно, заблокировал бота',
  });
}

async function onMessage(msg, url, shop) {
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : '';
  if (cmd === '/start') return welcome(chatId, msg.from?.first_name, url, shop.eta || '30–60 минут');
  if (cmd === '/id' || cmd === '/chatid') {
    return tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `ID этого чата: <code>${chatId}</code>\n\nЧтобы заказы приходили сюда, укажите его в Vercel в переменной <b>ADMIN_CHAT_ID</b> и сделайте Redeploy.`,
    });
  }
  if (isAdminChat(chatId)) {
    if (msg.reply_to_message) return relayToCustomer(msg);
    return;
  }
  if (msg.chat.type !== 'private') return; // в чужих группах молчим
  if (cmd) return welcome(chatId, msg.from?.first_name, url, shop.eta || '30–60 минут');
  if (!ADMIN_CHAT_IDS.length) {
    return tg('sendMessage', { chat_id: chatId, text: 'Собрать заказ проще всего в магазине — кнопка ниже 👇', reply_markup: webAppButton(url) });
  }
  return relayToAdmins(msg, url);
}

async function onCallback(q) {
  const data = String(q.data || '');
  if (data === 'noop') return tg('answerCallbackQuery', { callback_query_id: q.id });
  const [kind, status, orderId, userId] = data.split(':');
  if (kind !== 's' || !STATUS[status]) return tg('answerCallbackQuery', { callback_query_id: q.id });
  const chatId = String(q.message?.chat?.id || '');
  if (!isAdminChat(chatId)) {
    return tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа', show_alert: true });
  }
  await tg('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: q.message.message_id,
    reply_markup: statusKeyboard(status, orderId, userId),
  });
  let note = `Статус: ${STATUS[status].label}`;
  if (Number(userId) && STATUS[status].customer) {
    const r = await tg('sendMessage', { chat_id: Number(userId), text: STATUS[status].customer(orderId) });
    note += r.ok ? ' · клиент уведомлён' : ' · клиенту написать не удалось';
  }
  if (status === 'cancel' || status === 'done') {
    const by = q.from?.first_name ? ` (${q.from.first_name})` : '';
    await tg('sendMessage', {
      chat_id: chatId,
      reply_parameters: { message_id: q.message.message_id },
      text: `Заказ №${orderId}: ${STATUS[status].label}${by}`,
    });
  }
  return tg('answerCallbackQuery', { callback_query_id: q.id, text: note });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 200, { ok: true, hint: 'Это webhook бота. Для настройки откройте /api/setup' });
  if (!BOT_TOKEN) return send(res, 200, { ok: true });
  if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return send(res, 401, { ok: false });
  const update = readBody(req);
  const url = baseUrl(req);
  try {
    const { shop } = await loadShop(req);
    if (update.message) await onMessage(update.message, url, shop);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error(e);
  }
  return send(res, 200, { ok: true });
}
