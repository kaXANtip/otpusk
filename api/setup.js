// GET /api/setup — одноразовая настройка бота после деплоя:
// webhook, кнопка меню «Открыть магазин», команды и описание.
// Если задана переменная SETUP_KEY — открывайте /api/setup?key=ВАШ_КЛЮЧ

import { BOT_TOKEN, ADMIN_CHAT_IDS, send, tg, baseUrl, webhookSecret, loadShop } from './_lib/common.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (process.env.SETUP_KEY && url.searchParams.get('key') !== process.env.SETUP_KEY) {
    return send(res, 403, { ok: false, error: 'Неверный ключ: добавьте ?key=… (значение SETUP_KEY)' });
  }
  if (!BOT_TOKEN) return send(res, 400, { ok: false, error: 'Не задан BOT_TOKEN в переменных окружения Vercel' });

  const site = baseUrl(req);
  const { shop } = await loadShop(req);
  const eta = shop.eta || '30–60 мин';
  const me = await tg('getMe', {});
  if (!me.ok) return send(res, 400, { ok: false, error: 'BOT_TOKEN неверный: Telegram его не принял', telegram: me.description });

  const steps = {};
  steps.webhook = await tg('setWebhook', {
    url: `${site}/api/bot`,
    secret_token: webhookSecret(),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  steps.menuButton = await tg('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Магазин', web_app: { url: site } },
  });
  steps.commands = await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть магазин' },
      { command: 'id', description: 'Узнать ID чата (для настройки)' },
    ],
  });
  steps.shortDescription = await tg('setMyShortDescription', { short_description: `Доставка продуктов по Крыму за ${eta} 🌴` });
  steps.description = await tg('setMyDescription', {
    description: `«Отпуск» — доставка продуктов по Крыму.\n\nМолоко, хлеб, мясо, заморозка, снеки и напитки — привезём за ${eta} или ко времени. Оплата при получении.\n\nНажмите «Старт», чтобы открыть магазин.`,
  });

  const ok = Object.values(steps).every((s) => s.ok);
  return send(res, ok ? 200 : 500, {
    ok,
    bot: `@${me.result.username}`,
    webapp: site,
    adminChats: ADMIN_CHAT_IDS.length ? ADMIN_CHAT_IDS : 'не заданы — напишите боту /id и укажите ADMIN_CHAT_ID в Vercel',
    steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v.ok ? 'ok' : v.description])),
    next: ADMIN_CHAT_IDS.length
      ? 'Готово! Откройте бота и нажмите «Магазин».'
      : `Напишите боту @${me.result.username} команду /id (или добавьте бота в группу и напишите /id там), затем укажите полученный ID в ADMIN_CHAT_ID и сделайте Redeploy.`,
  });
}
