// Состояние пользователя: корзина, избранное, адреса, контакты, заказы.
// Хранится в localStorage и синхронизируется с Telegram CloudStorage.

import { storageGet, storageSet, emitter, debounce, round2 } from './util.js';
import { cloud, tgUser } from './tg.js';
import { byId, shop, deliveryFee } from './data.js';

const P = 'otpusk:';
const bus = emitter();
export const on = bus.on;

const state = {
  cart: new Map(), // id → qty (порядок добавления сохраняется)
  favs: new Set(),
  addresses: [],
  addrId: null,
  contact: { name: '', phone: '' },
  prefs: { replace: 'call', payment: 'card', door: false, change: '' },
  orders: [],
  recent: [],
  promo: null,
};
const stamps = {};

// ---------------------------------------------------------------- сериализация
const codec = {
  cart: {
    enc: () => [...state.cart].map(([id, q]) => `${id}:${q}`).join(','),
    dec: (s) => new Map(String(s || '').split(',').filter(Boolean).map((x) => x.split(':')).map(([id, q]) => [id, Math.max(1, parseInt(q, 10) || 1)])),
  },
  favs: { enc: () => [...state.favs].join(','), dec: (s) => new Set(String(s || '').split(',').filter(Boolean)) },
  addresses: { enc: () => JSON.stringify({ list: state.addresses, sel: state.addrId }), dec: (s) => JSON.parse(s || '{}') },
  contact: { enc: () => JSON.stringify(state.contact), dec: (s) => JSON.parse(s || '{}') },
  prefs: { enc: () => JSON.stringify(state.prefs), dec: (s) => JSON.parse(s || '{}') },
};
const CLOUD_KEYS = Object.keys(codec);

function applyValue(key, raw) {
  const v = codec[key].dec(raw);
  if (key === 'cart') state.cart = v;
  else if (key === 'favs') state.favs = v;
  else if (key === 'addresses') {
    state.addresses = Array.isArray(v.list) ? v.list : [];
    state.addrId = v.sel || state.addresses[0]?.id || null;
  } else if (key === 'contact') state.contact = { ...state.contact, ...v };
  else if (key === 'prefs') state.prefs = { ...state.prefs, ...v };
}

const dirtyCloud = new Set();
const flushCloud = debounce(() => {
  const keys = [...dirtyCloud];
  dirtyCloud.clear();
  for (const k of keys) {
    const value = JSON.stringify({ t: stamps[k], v: codec[k].enc() });
    if (value.length <= 4096) cloud.set(k, value); // лимит CloudStorage — 4096 символов на ключ
  }
}, 900);

function persist(key) {
  stamps[key] = Date.now();
  if (codec[key]) {
    storageSet(P + key, { t: stamps[key], v: codec[key].enc() });
    if (cloud.ok) {
      dirtyCloud.add(key);
      flushCloud();
    }
  } else {
    storageSet(P + key, state[key]);
  }
}

export async function loadStore() {
  for (const k of CLOUD_KEYS) {
    const rec = storageGet(P + k, null);
    if (rec && rec.v != null) {
      try {
        applyValue(k, rec.v);
        stamps[k] = rec.t || 0;
      } catch {}
    }
  }
  state.orders = storageGet(P + 'orders', []);
  state.recent = storageGet(P + 'recent', []);

  const u = tgUser();
  if (u && !state.contact.name) state.contact.name = [u.first_name, u.last_name].filter(Boolean).join(' ');

  // облако Telegram: берём более свежую версию
  if (cloud.ok) {
    cloud.getMany(CLOUD_KEYS).then((vals) => {
      let changed = false;
      for (const k of CLOUD_KEYS) {
        if (!vals[k]) continue;
        try {
          const rec = JSON.parse(vals[k]);
          if (rec && rec.t > (stamps[k] || 0)) {
            applyValue(k, rec.v);
            stamps[k] = rec.t;
            storageSet(P + k, rec);
            changed = true;
          }
        } catch {}
      }
      if (changed) {
        pruneCart();
        bus.emit('cart', {});
        bus.emit('favs', {});
        bus.emit('addr', {});
        bus.emit('sync', {});
      }
    });
  }
  return pruneCart();
}

// ---------------------------------------------------------------- корзина
export const cart = {
  qty: (id) => state.cart.get(id) || 0,
  count: () => [...state.cart.values()].reduce((a, b) => a + b, 0),
  size: () => state.cart.size,
  ids: () => [...state.cart.keys()],
  set(id, q) {
    const max = shop?.maxQty || 50;
    q = Math.max(0, Math.min(max, q | 0));
    const prev = cart.qty(id);
    if (q === prev) return prev;
    if (q === 0) state.cart.delete(id);
    else state.cart.set(id, q);
    persist('cart');
    bus.emit('cart', { id, q, prev });
    return q;
  },
  add: (id, n = 1) => cart.set(id, cart.qty(id) + n),
  inc: (id) => cart.set(id, cart.qty(id) + 1),
  dec: (id) => cart.set(id, cart.qty(id) - 1),
  atMax: (id) => cart.qty(id) >= (shop?.maxQty || 50),
  clear() {
    const snapshot = new Map(state.cart);
    state.cart.clear();
    persist('cart');
    bus.emit('cart', { cleared: true });
    return snapshot;
  },
  restore(snapshot) {
    state.cart = new Map(snapshot);
    persist('cart');
    bus.emit('cart', { restored: true });
  },
  lines() {
    const out = [];
    for (const [id, qty] of state.cart) {
      const p = byId.get(id);
      if (p) out.push({ p, qty, sum: round2(p.p * qty) });
    }
    return out;
  },
  totals() {
    const lines = cart.lines();
    const subtotal = round2(lines.reduce((a, l) => a + l.sum, 0));
    const count = lines.reduce((a, l) => a + l.qty, 0);
    const fee = lines.length ? deliveryFee(subtotal) : 0;
    const promo = state.promo && subtotal >= (state.promo.minSubtotal || 0) ? state.promo : null;
    const discount = promo ? round2(Math.min(promo.maxDiscount || Infinity, subtotal * (promo.percent || 0) / 100 + (promo.amount || 0), subtotal)) : 0;
    const total = round2(subtotal + fee - discount);
    return { lines, subtotal, count, fee, discount, promo, total, minOk: subtotal >= (shop?.minOrder || 0) };
  },
};

/** Убираем товары, которых больше нет в каталоге */
function pruneCart() {
  let removed = 0;
  for (const id of [...state.cart.keys()]) {
    if (!byId.has(id)) {
      state.cart.delete(id);
      removed++;
    }
  }
  for (const id of [...state.favs]) if (!byId.has(id)) state.favs.delete(id);
  if (removed) persist('cart');
  return { removed };
}

// ---------------------------------------------------------------- избранное
export const favs = {
  has: (id) => state.favs.has(id),
  list: () => [...state.favs].map((id) => byId.get(id)).filter(Boolean).reverse(),
  count: () => state.favs.size,
  toggle(id) {
    const on = !state.favs.has(id);
    on ? state.favs.add(id) : state.favs.delete(id);
    persist('favs');
    bus.emit('favs', { id, on });
    return on;
  },
};

// ---------------------------------------------------------------- адреса
export const addresses = {
  list: () => state.addresses,
  current: () => state.addresses.find((a) => a.id === state.addrId) || null,
  select(id) {
    state.addrId = id;
    persist('addresses');
    bus.emit('addr', {});
  },
  save(addr) {
    const i = state.addresses.findIndex((a) => a.id === addr.id);
    if (i >= 0) state.addresses[i] = addr;
    else state.addresses.unshift(addr);
    state.addrId = addr.id;
    persist('addresses');
    bus.emit('addr', {});
  },
  remove(id) {
    state.addresses = state.addresses.filter((a) => a.id !== id);
    if (state.addrId === id) state.addrId = state.addresses[0]?.id || null;
    persist('addresses');
    bus.emit('addr', {});
  },
};

export function addrLine(a, { full = false } = {}) {
  if (!a) return '';
  const main = a.street;
  if (!full) return main;
  const parts = [a.city, a.street];
  if (!a.house) {
    if (a.flat) parts.push(`кв. ${a.flat}`);
    if (a.entrance) parts.push(`подъезд ${a.entrance}`);
    if (a.floor) parts.push(`этаж ${a.floor}`);
    if (a.intercom) parts.push(`домофон ${a.intercom}`);
  }
  return parts.filter(Boolean).join(', ');
}

export function addrDetails(a) {
  if (!a) return '';
  if (a.house) return [a.city, 'частный дом'].filter(Boolean).join(' · ');
  const parts = [];
  if (a.flat) parts.push(`кв. ${a.flat}`);
  if (a.entrance) parts.push(`под. ${a.entrance}`);
  if (a.floor) parts.push(`эт. ${a.floor}`);
  return [a.city, parts.join(', ')].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- контакты и настройки
export const contact = {
  get: () => state.contact,
  set(patch) {
    state.contact = { ...state.contact, ...patch };
    persist('contact');
  },
};

export const prefs = {
  get: () => state.prefs,
  set(patch) {
    state.prefs = { ...state.prefs, ...patch };
    persist('prefs');
  },
};

export const promo = {
  get: () => state.promo,
  set(p) {
    state.promo = p;
    bus.emit('cart', { promo: true });
  },
};

// ---------------------------------------------------------------- заказы
export const orders = {
  list: () => state.orders,
  get: (id) => state.orders.find((o) => String(o.id) === String(id)),
  add(o) {
    state.orders = [o, ...state.orders].slice(0, 40);
    persist('orders');
    bus.emit('orders', {});
  },
};

// ---------------------------------------------------------------- история поиска
export const recent = {
  list: () => state.recent,
  push(q) {
    q = String(q || '').trim();
    if (q.length < 2) return;
    state.recent = [q, ...state.recent.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    persist('recent');
  },
  clear() {
    state.recent = [];
    persist('recent');
  },
};
