// Общий код серверных функций: каталог, расчёт заказа, Telegram Bot API

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROMO_CODES } from './promo-codes.js';

// ---------------------------------------------------------------- окружение
export const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
export const ADMIN_CHAT_IDS = String(process.env.ADMIN_CHAT_ID || '')
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

export function baseUrl(req) {
  if (process.env.WEBAPP_URL) return process.env.WEBAPP_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${host && host.startsWith('localhost') ? proto : 'https'}://${host}`;
}

export function webhookSecret() {
  return crypto.createHash('sha256').update('otpusk-webhook:' + BOT_TOKEN).digest('hex').slice(0, 48);
}

// ---------------------------------------------------------------- http-помощники
export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return {};
    }
  }
  return b;
}

// ---------------------------------------------------------------- данные магазина
let cache = null;
async function readJSON(rel, req) {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', rel), 'utf8'));
  } catch (e) {
    // запасной путь: берём файл с собственного сайта
    if (!req) throw e;
    const r = await fetch(`${baseUrl(req)}/data/${rel}`);
    if (!r.ok) throw new Error(`Не удалось прочитать ${rel}`);
    return r.json();
  }
}

export async function loadShop(req) {
  if (cache) return cache;
  const [catalog, shop] = await Promise.all([readJSON('catalog.json', req), readJSON('shop.json', req)]);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  cache = { catalog, shop, byId };
  return cache;
}

export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function money(v) {
  const r = round2(v);
  const s = Number.isInteger(r) ? r.toLocaleString('ru-RU') : r.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s.replace(/ /g, ' ') + ' ₽';
}

export function deliveryFee(shop, subtotal) {
  const tiers = [...(shop.delivery || [])].sort((a, b) => a.from - b.from);
  let fee = tiers[0]?.fee ?? 0;
  for (const t of tiers) if (subtotal >= t.from) fee = t.fee;
  return fee;
}

// ---------------------------------------------------------------- промокоды
function promoTable() {
  let extra = {};
  if (process.env.PROMO_CODES) {
    try {
      extra = JSON.parse(process.env.PROMO_CODES);
    } catch {
      console.error('PROMO_CODES: неверный JSON');
    }
  }
  const all = { ...PROMO_CODES, ...extra };
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k.trim().toUpperCase(), v]));
}

export function findPromo(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const p = promoTable()[c];
  if (!p || p.active === false) return null;
  if (p.until && Date.now() > Date.parse(p.until)) return null;
  return { code: c, title: p.title || 'Скидка по промокоду', percent: p.percent || 0, amount: p.amount || 0, minSubtotal: p.minSubtotal || 0, maxDiscount: p.maxDiscount || 0 };
}

export function promoDiscount(promo, subtotal) {
  if (!promo || subtotal < (promo.minSubtotal || 0)) return 0;
  let d = (subtotal * (promo.percent || 0)) / 100 + (promo.amount || 0);
  if (promo.maxDiscount) d = Math.min(d, promo.maxDiscount);
  return round2(Math.min(d, subtotal));
}

// ---------------------------------------------------------------- расчёт заказа (цены — только из каталога)
export function computeOrder({ shop, byId }, items, promoCode) {
  const maxQty = shop.maxQty || 50;
  const lines = [];
  const missing = [];
  const seen = new Set();
  if (!Array.isArray(items) || !items.length) return { error: 'Корзина пуста' };
  if (items.length > 200) return { error: 'Слишком много позиций в заказе' };
  for (const it of items) {
    const id = String(it?.id || '');
    if (seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    const qty = Math.floor(Number(it?.qty));
    if (!p) {
      missing.push(id);
      continue;
    }
    if (!(qty >= 1 && qty <= maxQty)) return { error: `Неверное количество товара «${p.n}»` };
    lines.push({ p, qty, sum: round2(p.p * qty) });
  }
  const subtotal = round2(lines.reduce((a, l) => a + l.sum, 0));
  const fee = lines.length ? deliveryFee(shop, subtotal) : 0;
  const promo = findPromo(promoCode);
  const discount = promoDiscount(promo, subtotal);
  const total = round2(subtotal + fee - discount);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  return { lines, missing, subtotal, fee, promo: discount ? promo : null, discount, total, count };
}

// ---------------------------------------------------------------- Telegram
export async function tg(method, payload) {
  if (!BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN не задан' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) console.error(`Telegram ${method}:`, j.description);
    return j;
  } catch (e) {
    console.error(`Telegram ${method}:`, e.message);
    return { ok: false, description: e.message };
  }
}

/** Проверка подписи initData мини-приложения (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
export function verifyInitData(initData, maxAgeSec = 7 * 24 * 3600) {
  if (!initData || !BOT_TOKEN) return { status: 'absent' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { status: 'invalid' };
  params.delete('hash');
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const ok = calc.length === hash.length && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
  if (!ok) return { status: 'invalid' };
  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {}
  const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
  return { status: age > maxAgeSec ? 'expired' : 'ok', user };
}

export const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Разбить длинный текст на сообщения ≤ 4000 символов по строкам */
export function chunks(text, size = 3900) {
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > size && cur) {
      out.push(cur);
      cur = line;
    } else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) out.push(cur);
  return out;
}

export function webAppButton(url, text = '🛒 Открыть магазин') {
  return { inline_keyboard: [[{ text, web_app: { url } }]] };
}

// ---------------------------------------------------------------- статусы заказа
export const STATUS = {
  new: { label: '🆕 Новый' },
  acc: { label: '✅ Принят', customer: (id) => `✅ Заказ №${id} принят — уже собираем продукты.` },
  way: { label: '🛵 В пути', customer: (id) => `🛵 Курьер везёт заказ №${id}. Скоро будем!` },
  done: { label: '📦 Доставлен', customer: (id) => `📦 Заказ №${id} доставлен. Спасибо, что выбрали «Отпуск»! Приятного аппетита 🌴` },
  cancel: { label: '❌ Отменён', customer: (id) => `❌ Заказ №${id} отменён. Если это ошибка — просто ответьте на это сообщение или оформите заказ заново.` },
};

export function statusKeyboard(status, orderId, userId) {
  const cb = (s) => `s:${s}:${orderId}:${userId || 0}`;
  const label = { text: `Статус: ${STATUS[status].label}`, callback_data: 'noop' };
  if (status === 'new') return { inline_keyboard: [[{ text: '✅ Принять', callback_data: cb('acc') }, { text: '❌ Отменить', callback_data: cb('cancel') }]] };
  if (status === 'acc') return { inline_keyboard: [[label], [{ text: '🛵 Передан курьеру', callback_data: cb('way') }, { text: '❌ Отменить', callback_data: cb('cancel') }]] };
  if (status === 'way') return { inline_keyboard: [[label], [{ text: '📦 Доставлен', callback_data: cb('done') }]] };
  return { inline_keyboard: [[label]] };
}
