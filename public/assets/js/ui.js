// Общие компоненты интерфейса: карточки товаров, шторки, диалоги, тосты

import { $, esc, icon, money, norm, pl, ITEMS } from './util.js';
import { byId, emojiOf, toneOf } from './data.js';
import { cart, favs } from './store.js';
import { hasNativeBack, nativeConfirm } from './tg.js';
import { pushOverlay, popOverlay } from './router.js';

// ---------------------------------------------------------------- каркас экрана
export function screenEl(cls = '') {
  const el = document.createElement('section');
  el.className = 'screen ' + cls;
  return el;
}

export function appbar({ title, sub = '', back = true, actions = '' }) {
  const showBack = back && !hasNativeBack;
  return `<header class="appbar ${showBack ? 'has-back' : ''}">
    ${showBack ? `<button class="iconbtn" data-act="back" aria-label="Назад">${icon('back')}</button>` : ''}
    <h1 class="appbar__title">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h1>
    ${actions}
  </header>`;
}

/** Тень под шапкой и «прилипшими» блоками при прокрутке */
export function bindScroll(el, extra) {
  const body = el.querySelector('.screen__body');
  const bar = el.querySelector('.appbar, .searchbar');
  let ticking = false;
  body?.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        bar?.classList.toggle('is-scrolled', body.scrollTop > 4);
        extra?.(body.scrollTop, body);
      });
    },
    { passive: true }
  );
  return body;
}

export function emptyHTML({ art, title, text = '', btn = '' }) {
  return `<div class="empty">
    <div class="empty__art" aria-hidden="true">${art}</div>
    <div class="empty__title">${esc(title)}</div>
    ${text ? `<p class="empty__text">${esc(text)}</p>` : ''}
    ${btn}
  </div>`;
}

export function highlight(text, query) {
  const tokens = norm(query)
    .split(' ')
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]'));
  if (!tokens.length) return esc(text);
  const re = new RegExp(`(${tokens.join('|')})`, 'gi');
  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)))
    .join('');
}

// ---------------------------------------------------------------- товар
export function phHTML(p, cls = '') {
  const img = p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" decoding="async">` : '';
  return `<div class="ph t-${toneOf(p)} ${cls}"><span class="ph__e" aria-hidden="true">${emojiOf(p)}</span>${img}</div>`;
}

export function badgeHTML(p) {
  if (p.o) return `<span class="badge badge--sale">−${Math.round((1 - p.p / p.o) * 100)}%</span>`;
  if (p.a) return `<span class="badge badge--deal">${icon('zap')}Выгодно</span>`;
  if (p.l) return `<span class="badge badge--local">${icon('leaf')}Крым</span>`;
  return '';
}

export function ctlHTML(p, variant = 'card') {
  const q = cart.qty(p.id);
  const max = cart.atMax(p.id) ? 'disabled' : '';
  const id = p.id;
  if (variant === 'lg') {
    if (!q) {
      return `<button class="btn btn--primary btn--split" data-act="add" data-id="${id}">
        <span>В корзину</span><span class="btn__sub">${p.o ? `<small><s>${money(p.o)}</s></small>` : ''}${money(p.p)}</span></button>`;
    }
    return `<div class="stepper stepper--lg" role="group" aria-label="Количество">
      <button data-act="dec" data-id="${id}" aria-label="Убрать одну штуку">${icon(q === 1 ? 'trash' : 'minus')}</button>
      <span class="stepper__qty" aria-live="polite">${q} шт<small>${money(p.p * q)}</small></span>
      <button data-act="inc" data-id="${id}" aria-label="Добавить ещё" ${max}>${icon('plus')}</button></div>`;
  }
  if (variant === 'row') {
    return `<div class="stepper stepper--sm stepper--soft" role="group" aria-label="Количество">
      <button data-act="dec" data-id="${id}" aria-label="${q === 1 ? 'Удалить из корзины' : 'Меньше'}">${icon(q === 1 ? 'trash' : 'minus')}</button>
      <span class="stepper__qty" aria-live="polite">${q}</span>
      <button data-act="inc" data-id="${id}" aria-label="Больше" ${max}>${icon('plus')}</button></div>`;
  }
  if (!q) {
    return `<button class="addbtn ${p.o ? 'is-sale' : ''}" data-act="add" data-id="${id}" aria-label="В корзину: ${esc(p.n)}, ${money(p.p)}">
      <span class="num">${money(p.p)}</span>${icon('plus')}</button>`;
  }
  return `<div class="stepper" role="group" aria-label="Количество">
    <button data-act="dec" data-id="${id}" aria-label="Меньше">${icon('minus')}</button>
    <span class="stepper__qty" aria-live="polite">${q}</span>
    <button data-act="inc" data-id="${id}" aria-label="Больше" ${max}>${icon('plus')}</button></div>`;
}

export function favBtnHTML(p) {
  const on = favs.has(p.id);
  return `<button class="fav ${on ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-pressed="${on}" aria-label="Избранное">
    <span class="fav__in">${icon('heart')}</span></button>`;
}

export function cardHTML(p, { hl = '' } = {}) {
  return `<article class="pcard" data-pid="${p.id}">
    <button class="pcard__media" data-act="product" data-id="${p.id}" aria-label="${esc(p.n)}">${phHTML(p)}${badgeHTML(p)}</button>
    ${favBtnHTML(p)}
    <div class="pcard__ctl" data-ctl="${p.id}">${ctlHTML(p)}</div>
    <div class="pcard__name" data-act="product" data-id="${p.id}">${hl ? highlight(p.n, hl) : esc(p.n)}</div>
    <div class="pcard__meta">${esc(p.w || '')}${p.o ? `<s>${money(p.o)}</s>` : ''}</div>
  </article>`;
}

export const gridHTML = (items, opts) => `<div class="pgrid">${items.map((p) => cardHTML(p, opts)).join('')}</div>`;

export function railHTML(items, moreTo = '') {
  return `<div class="rail">${items.map((p) => cardHTML(p)).join('')}${
    moreTo ? `<button class="rail__more" data-act="go" data-to="${esc(moreTo)}"><span>${icon('right')}</span>Смотреть все</button>` : ''
  }</div>`;
}

export function sectionHTML(title, inner, moreTo = '') {
  return `<section class="section">
    <div class="section__head"><h2 class="section__title">${esc(title)}</h2>${
      moreTo ? `<button class="section__more" data-act="go" data-to="${esc(moreTo)}">Все${icon('right', 'i--sm')}</button>` : ''
    }</div>${inner}</section>`;
}

export function syncProduct(id) {
  const p = byId.get(id);
  if (!p) return;
  document.querySelectorAll(`[data-ctl="${id}"]`).forEach((c) => {
    c.innerHTML = ctlHTML(p, c.dataset.variant || 'card');
  });
}

export function syncAllProducts() {
  document.querySelectorAll('[data-ctl]').forEach((c) => {
    const p = byId.get(c.dataset.ctl);
    if (p) c.innerHTML = ctlHTML(p, c.dataset.variant || 'card');
  });
}

export function syncFav(id) {
  const on = favs.has(id);
  document.querySelectorAll(`[data-act="fav"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

// ---------------------------------------------------------------- вкладка «Корзина»
const CART_TAB_EMPTY = `<span class="tab__icon">${icon('bag')}</span><span class="tab__label">Корзина</span>`;
export function updateCartTab(bump = false) {
  const t = $('.tab--cart');
  if (!t) return;
  const { subtotal, count } = cart.totals();
  if (count) {
    t.classList.add('has-items');
    t.innerHTML = `<span class="cartpill">${icon('bag')}<span class="num">${money(subtotal)}</span></span>`;
    t.setAttribute('aria-label', `Корзина: ${pl(count, ITEMS)} на ${money(subtotal)}`);
  } else {
    t.classList.remove('has-items');
    t.innerHTML = CART_TAB_EMPTY;
    t.setAttribute('aria-label', 'Корзина');
  }
  if (bump) {
    t.classList.remove('bump');
    void t.offsetWidth;
    t.classList.add('bump');
  }
}

// ---------------------------------------------------------------- тосты
export function toast(text, { type = 'info', action = null, ms = 2800, ico = '' } = {}) {
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const name = ico || (type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info');
  el.innerHTML = `${icon(name)}<div class="toast__txt">${esc(text)}</div>${action ? `<button class="toast__act">${esc(action.label)}</button>` : ''}`;
  let timer;
  const hide = () => {
    clearTimeout(timer);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.querySelector('.toast__act').addEventListener('click', () => {
      action.fn();
      hide();
    });
  }
  box.append(el);
  timer = setTimeout(hide, action ? Math.max(ms, 4500) : ms);
  return hide;
}

// ---------------------------------------------------------------- шторка
export function openSheet({ title = '', body = '', foot = '', cls = '', flush = false, onClose, label = '' } = {}) {
  const layer = $('#layer');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('section');
  el.className = `sheet ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title || label || 'Окно');
  el.innerHTML = `<div class="sheet__grip"></div>
    ${title ? `<div class="sheet__head"><h2 class="sheet__title">${esc(title)}</h2><button class="sheet__close" data-sheet-close aria-label="Закрыть">${icon('x')}</button></div>` : ''}
    <div class="sheet__body ${flush ? 'flush' : ''}"></div>
    ${foot !== null ? '<div class="sheet__foot"></div>' : ''}`;
  const bodyEl = el.querySelector('.sheet__body');
  const footEl = el.querySelector('.sheet__foot');
  const setBody = (b) => (typeof b === 'string' ? (bodyEl.innerHTML = b) : (bodyEl.replaceChildren(b)));
  setBody(body);
  if (footEl) {
    if (foot) typeof foot === 'string' ? (footEl.innerHTML = foot) : footEl.replaceChildren(foot);
    else footEl.remove();
  }
  layer.append(scrim, el);
  requestAnimationFrame(() => {
    scrim.classList.add('is-open');
    el.classList.add('is-open');
  });

  let closed = false;
  const token = pushOverlay(() => close(true));
  function close(fromRouter = false) {
    if (closed) return;
    closed = true;
    if (!fromRouter) popOverlay(token);
    el.classList.add('is-closing');
    el.classList.remove('is-open');
    el.style.transform = '';
    scrim.classList.remove('is-open');
    setTimeout(() => {
      scrim.remove();
      el.remove();
    }, 260);
    onClose?.();
  }
  scrim.addEventListener('click', () => close());
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-close]')) close();
  });

  // свайп вниз — закрыть
  let y0 = 0;
  let x0 = 0;
  let dy = 0;
  let drag = false;
  el.addEventListener(
    'touchstart',
    (e) => {
      const t = e.target;
      if (t.closest('.rail, .chips, .co-items, input, textarea, select')) return;
      if (bodyEl.contains(t) && bodyEl.scrollTop > 0) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
      drag = 'maybe';
    },
    { passive: true }
  );
  el.addEventListener(
    'touchmove',
    (e) => {
      if (!drag) return;
      dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;
      if (drag === 'maybe') {
        if (Math.abs(dx) > Math.abs(dy) || dy < -4) {
          drag = false;
          return;
        }
        if (dy < 8) return;
        drag = true;
        el.classList.add('is-dragging');
      }
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy - 8)}px)`;
    },
    { passive: false }
  );
  const end = () => {
    if (drag === true) {
      el.classList.remove('is-dragging');
      if (dy > Math.min(140, el.offsetHeight * 0.22)) close();
      else el.style.transform = '';
    }
    drag = false;
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);

  return { el, body: bodyEl, foot: footEl, close, setBody };
}

// ---------------------------------------------------------------- подтверждение
export function confirmDialog({ title, text = '', ok = 'Да', cancel = 'Отмена', danger = false }) {
  const native = nativeConfirm({ title, text, ok, danger });
  if (native) return native;
  return new Promise((resolve) => {
    const layer = $('#layer');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const dlg = document.createElement('div');
    dlg.className = 'dialog';
    dlg.setAttribute('role', 'alertdialog');
    dlg.innerHTML = `<div class="dialog__title">${esc(title)}</div>${text ? `<div class="dialog__text">${esc(text)}</div>` : ''}
      <div class="btnrow"><button class="btn btn--ghost" data-r="0">${esc(cancel)}</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-r="1">${esc(ok)}</button></div>`;
    layer.append(scrim, dlg);
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      dlg.classList.add('is-open');
    });
    let done = false;
    const token = pushOverlay(() => finish(false, true));
    function finish(v, fromRouter = false) {
      if (done) return;
      done = true;
      if (!fromRouter) popOverlay(token);
      scrim.classList.remove('is-open');
      dlg.classList.remove('is-open');
      setTimeout(() => {
        scrim.remove();
        dlg.remove();
      }, 220);
      resolve(v);
    }
    scrim.addEventListener('click', () => finish(false));
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) finish(b.dataset.r === '1');
    });
    dlg.querySelector('[data-r="1"]').focus();
  });
}
