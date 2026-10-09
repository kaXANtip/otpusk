// Навигация: у каждой вкладки свой стек экранов (как в нативных приложениях),
// поверх — шторки/диалоги. Кнопка «Назад» Telegram закрывает верхний слой.

import { $, $$, after } from './util.js';
import { bindBackButton, showBack, haptic } from './tg.js';

const TABS = ['home', 'catalog', 'cart', 'profile'];
const routes = new Map();
const stacks = { home: [], catalog: [], cart: [], profile: [] };
const overlays = [];
let tab = 'home';
let screensEl;

export const currentTab = () => tab;
export const top = () => stacks[tab][stacks[tab].length - 1];

/** name: 'category' → render(params) возвращает { el, onShow, onHide, destroy, tabbar } */
export function define(name, render) {
  routes.set(name, render);
}

function parse(path) {
  const [p, qs] = String(path || '').replace(/^#?\/?/, '').split('?');
  const [name, ...rest] = p.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (rest.length) params.id = decodeURIComponent(rest.join('/'));
  return { name: name || 'home', params, path: '/' + p + (qs ? '?' + qs : '') };
}

function build(path) {
  const { name, params, path: full } = parse(path);
  const render = routes.get(name) || routes.get('home');
  const view = render(params) || {};
  view.name = name;
  view.path = full;
  view.el.classList.add('screen');
  view.el.dataset.screen = name;
  return view;
}

function syncChrome() {
  const v = top();
  const noTab = v && v.tabbar === false;
  $('#app').classList.toggle('no-tabbar', !!noTab);
  $$('.tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  });
  showBack(overlays.length > 0 || stacks[tab].length > 1 || tab !== 'home');
  try {
    history.replaceState(null, '', '#' + (v?.path || '/'));
  } catch {}
}

function mount(view) {
  screensEl.append(view.el);
  view.onMount?.();
}

function show(view) {
  view.el.classList.remove('is-off');
  view.onShow?.();
}

function hide(view) {
  view.el.classList.add('is-off');
  view.onHide?.();
}

function destroy(view) {
  view.destroy?.();
  view.el.remove();
}

/**
 * Анимации прерываемые: новое действие сразу завершает текущий переход,
 * поэтому быстрые нажатия никогда не «теряются» и стек не ломается.
 */
let pending = null;
function settle() {
  const f = pending;
  pending = null;
  f?.();
}
function transition(el, ms, cleanup) {
  let done = false;
  const fin = () => {
    if (done) return;
    done = true;
    if (pending === fin) pending = null;
    cleanup();
  };
  pending = fin;
  after(el, ms, fin);
}

/** Открыть экран поверх текущего (в стеке текущей вкладки) */
export function go(path, { replace = false, animate = true } = {}) {
  settle();
  const { name } = parse(path);
  if (TABS.includes(name)) return switchTab(name, { reset: true });
  const stack = stacks[tab];
  const prev = stack[stack.length - 1];
  const view = build(path);
  if (replace && prev && stack.length > 1) {
    stack.pop();
    stack.push(view);
    mount(view);
    destroy(prev);
    show(view);
    syncChrome();
    return;
  }
  stack.push(view);
  if (!animate || !prev) {
    mount(view);
    if (prev) hide(prev);
    show(view);
    syncChrome();
    return;
  }
  view.el.classList.add('is-entering');
  mount(view);
  syncChrome();
  void view.el.offsetWidth;
  view.el.classList.add('is-in');
  prev.el.classList.add('is-under');
  show(view);
  transition(view.el, 320, () => {
    view.el.classList.remove('is-entering', 'is-in');
    prev.el.classList.remove('is-under');
    hide(prev);
  });
}

function pop() {
  settle();
  const stack = stacks[tab];
  if (stack.length < 2) return false;
  const cur = stack.pop();
  const prev = stack[stack.length - 1];
  prev.el.style.transition = 'none';
  prev.el.classList.add('is-under');
  prev.el.classList.remove('is-off');
  void prev.el.offsetWidth;
  prev.el.style.transition = '';
  prev.el.classList.add('is-restoring');
  cur.el.classList.add('is-leaving');
  cur.onHide?.();
  prev.onShow?.();
  syncChrome();
  transition(cur.el, 220, () => {
    destroy(cur);
    prev.el.classList.remove('is-under', 'is-restoring');
  });
  return true;
}

export function switchTab(name, { reset = false } = {}) {
  if (!TABS.includes(name)) return;
  settle();
  const same = name === tab;
  const curTop = top();
  if (same) {
    if (stacks[tab].length > 1) {
      // повторный тап по вкладке — к её корню
      while (stacks[tab].length > 2) destroy(stacks[tab].splice(1, 1)[0]);
      pop();
    } else {
      curTop?.el.querySelector('.screen__body')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  haptic.select();
  tab = name;
  if (!stacks[tab].length) {
    const root = build('/' + name);
    stacks[tab].push(root);
    mount(root);
  }
  if (reset) while (stacks[tab].length > 1) destroy(stacks[tab].pop());
  if (curTop) hide(curTop);
  const v = top();
  v.el.classList.remove('is-fading');
  void v.el.offsetWidth;
  v.el.classList.add('is-fading');
  show(v);
  syncChrome();
}

/** Сбросить стек вкладки и открыть экран поверх её корня (например, «Заказ оформлен») */
export function resetTo(tabName, path) {
  settle();
  for (const t of TABS) {
    if (t === tabName) continue;
    while (stacks[t].length > 1) destroy(stacks[t].pop());
  }
  const curTop = top();
  if (tab !== tabName) {
    if (curTop) hide(curTop);
    tab = tabName;
    if (!stacks[tab].length) {
      const root = build('/' + tabName);
      stacks[tab].push(root);
      mount(root);
      hide(root);
    }
  }
  while (stacks[tab].length > 1) destroy(stacks[tab].pop());
  const root = stacks[tab][0];
  hide(root);
  const view = build(path);
  stacks[tab].push(view);
  view.el.classList.add('is-fading');
  mount(view);
  show(view);
  syncChrome();
}

export function back() {
  if (overlays.length) {
    const o = overlays.pop();
    o.close();
    syncChrome();
    return;
  }
  if (pop()) return;
  if (tab !== 'home') switchTab('home');
}

export function pushOverlay(close) {
  const token = { close };
  overlays.push(token);
  syncChrome();
  return token;
}

export function popOverlay(token) {
  const i = overlays.indexOf(token);
  if (i >= 0) overlays.splice(i, 1);
  syncChrome();
}

export const hasOverlay = () => overlays.length > 0;

export function start(initialPath) {
  screensEl = $('#screens');
  bindBackButton(back);
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    while (overlays.length) overlays.pop().close();
    switchTab(b.dataset.tab);
  });
  // Esc на компьютере и ручная правка адреса в браузере
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') back();
  });
  window.addEventListener('hashchange', () => {
    const p = location.hash.slice(1);
    if (p.startsWith('/') && p !== top()?.path) go(p);
  });

  const { name } = parse(initialPath);
  const root = build('/home');
  stacks.home.push(root);
  mount(root);
  if (TABS.includes(name) && name !== 'home') {
    hide(root);
    switchTab(name);
  } else if (name !== 'home' && routes.has(name)) {
    hide(root);
    go(initialPath, { animate: false });
  } else {
    show(root);
  }
  syncChrome();
}
