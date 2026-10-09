// Мелкие помощники, общие для всех экранов

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const nfInt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

/** 1234 → «1 234 ₽», 62.99 → «62,99 ₽» */
export function money(v) {
  const r = round2(v);
  return (Number.isInteger(r) ? nfInt.format(r) : nf2.format(r)) + ' ₽';
}

export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const pl = (n, forms) => `${n} ${plural(n, forms)}`;
export const ITEMS = ['товар', 'товара', 'товаров'];

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`.,;:!?()[\]{}/\\|+*_#№-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const raf = (fn) => {
  let queued = false;
  return (...a) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...a);
    });
  };
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function fmtDate(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

/** Только цифры телефона, приведённые к 7XXXXXXXXXX */
export function phoneDigits(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') d = '7' + d;
  return d.slice(0, 11);
}

export function fmtPhone(s) {
  const d = phoneDigits(s);
  if (!d) return '';
  const x = d[0] === '7' ? d.slice(1) : d;
  let out = '+7';
  if (x.length) out += ' (' + x.slice(0, 3);
  if (x.length >= 3) out += ')';
  if (x.length > 3) out += ' ' + x.slice(3, 6);
  if (x.length > 6) out += '-' + x.slice(6, 8);
  if (x.length > 8) out += '-' + x.slice(8, 10);
  return out;
}

export const phoneValid = (s) => /^7\d{10}$/.test(phoneDigits(s));

export function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим / нет места — живём без сохранения */
  }
}

/** Маленький event-emitter */
export function emitter() {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, payload) {
      map.get(evt)?.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error(e);
        }
      });
    },
  };
}

/** Выполнить fn после окончания transition у el (или по таймауту, если события не будет) */
export function after(el, ms, fn) {
  let done = false;
  const onEnd = (e) => {
    if (e.target === el) finish();
  };
  const finish = () => {
    if (done) return;
    done = true;
    el?.removeEventListener('transitionend', onEnd);
    fn();
  };
  el?.addEventListener('transitionend', onEnd);
  setTimeout(finish, ms + 60);
}
