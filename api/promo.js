// POST /api/promo — проверить промокод

import { send, readBody, findPromo, money, round2 } from './_lib/common.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Метод не поддерживается' });
  const { code, subtotal } = readBody(req);
  const promo = findPromo(code);
  if (!promo) return send(res, 404, { ok: false, error: 'Такого промокода нет или он закончился' });
  const sum = round2(Number(subtotal) || 0);
  if (sum < promo.minSubtotal) {
    return send(res, 400, { ok: false, error: `Промокод действует для заказов от ${money(promo.minSubtotal)}` });
  }
  return send(res, 200, { ok: true, promo });
}
