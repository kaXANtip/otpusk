// Точка входа мини-приложения «Отпуск»

import { $, icon } from './util.js';
import { initTelegram, paintChrome, prefersDark, haptic, startParam, inTelegram } from './tg.js';
import { loadData, byId } from './data.js';
import { loadStore, cart, favs, on } from './store.js';
import { define, start, go, switchTab, back } from './router.js';
import { updateCartTab, syncProduct, syncAllProducts, syncFav, toast } from './ui.js';

import home from './screens/home.js';
import catalog from './screens/catalog.js';
import cartScreen from './screens/cart.js';
import checkout from './screens/checkout.js';
import success from './screens/success.js';
import searchScreen from './screens/search.js';
import { categoryScreen, collectionScreen } from './screens/list.js';
import { ordersScreen, orderScreen } from './screens/orders.js';
import { profileScreen, favoritesScreen } from './screens/profile.js';
import { openProduct } from './screens/product.js';
import { openAddressPicker, openDeliveryInfo } from './screens/sheets.js';

// ---------------------------------------------------------------- тема
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = prefersDark() ? 'dark' : 'light';
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#ffffff';
  paintChrome(bg);
}

// ---------------------------------------------------------------- маршруты
define('home', home);
define('catalog', catalog);
define('cart', cartScreen);
define('profile', profileScreen);
define('category', categoryScreen);
define('collection', collectionScreen);
define('search', searchScreen);
define('checkout', checkout);
define('success', success);
define('orders', ordersScreen);
define('order', orderScreen);
define('favorites', favoritesScreen);

// ---------------------------------------------------------------- общие действия по data-act
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, id, to } = el.dataset;
  switch (act) {
    case 'add': {
      cart.add(id);
      haptic.light();
      break;
    }
    case 'inc': {
      if (cart.atMax(id)) {
        haptic.warning();
        toast('Больше добавить нельзя', { type: 'err' });
        break;
      }
      cart.inc(id);
      haptic.light();
      break;
    }
    case 'dec': {
      const fromCart = !!el.closest('.citem'); // до изменения: после него кнопка уже перерисована
      const left = cart.dec(id);
      haptic.light();
      if (left === 0 && fromCart) {
        const p = byId.get(id);
        toast(`Удалили «${p ? p.n.slice(0, 40) : 'товар'}»`, { action: { label: 'Вернуть', fn: () => cart.set(id, 1) } });
      }
      break;
    }
    case 'fav': {
      const onNow = favs.toggle(id);
      onNow ? haptic.success() : haptic.light();
      if (onNow) toast('Добавили в избранное', { type: 'ok', ico: 'heart', ms: 1800 });
      break;
    }
    case 'product':
      e.preventDefault();
      openProduct(id);
      break;
    case 'go':
      e.preventDefault();
      go(to);
      break;
    case 'tab':
      e.preventDefault();
      switchTab(to, { reset: true });
      break;
    case 'back':
      back();
      break;
    case 'addr':
      openAddressPicker();
      break;
    case 'info':
      openDeliveryInfo();
      break;
  }
});

// пока открыта экранная клавиатура, прячем нижние панели — иначе они висят над клавиатурой
const isTextField = (el) => el?.matches?.('input:not([type=checkbox]):not([type=radio]), textarea');
document.addEventListener('focusin', (e) => {
  if (isTextField(e.target) && !e.target.closest('.sheet')) $('#app').classList.add('kb-open');
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!isTextField(document.activeElement)) $('#app').classList.remove('kb-open');
  }, 60);
});

on('cart', (ev) => {
  if (ev.id) syncProduct(ev.id);
  else syncAllProducts();
  updateCartTab(ev.id && ev.q > (ev.prev || 0));
});
on('favs', (ev) => (ev.id ? syncFav(ev.id) : document.querySelectorAll('[data-act="fav"]').forEach((b) => syncFav(b.dataset.id))));
on('sync', () => updateCartTab());

// ---------------------------------------------------------------- deep links: t.me/bot/app?startapp=c_dairy
function initialPath() {
  const sp = startParam();
  if (sp) {
    const [kind, ...rest] = sp.split('_');
    const val = rest.join('_');
    if (kind === 'c') return `/category/${val}`;
    if (kind === 'col') return `/collection/${val}`;
    if (kind === 'cart') return '/cart';
    if (kind === 'p') return `/product/${val}`;
  }
  return location.hash.startsWith('#/') ? location.hash.slice(1) : '/home';
}

// ---------------------------------------------------------------- запуск
async function boot() {
  applyTheme();
  initTelegram({ onTheme: applyTheme });
  try {
    await loadData();
  } catch (e) {
    console.error(e);
    $('#splash').classList.add('is-hidden');
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="fatal"><div class="empty__art">📡</div><div class="empty__title">Не удалось загрузить каталог</div>
       <p class="empty__text">Проверьте интернет и попробуйте ещё раз</p>
       <button class="btn btn--primary" onclick="location.reload()">${icon('repeat')}Обновить</button></div>`
    );
    return;
  }
  const { removed } = await loadStore();
  let path = initialPath();
  let productId = '';
  if (path.startsWith('/product/')) {
    productId = path.split('/')[2];
    path = '/home';
  }
  start(path);
  updateCartTab();
  if (productId && byId.has(productId)) openProduct(productId);
  if (removed) toast('Некоторых товаров из корзины больше нет в продаже — мы их убрали', { ms: 4500 });

  requestAnimationFrame(() => $('#splash')?.classList.add('is-hidden'));
  setTimeout(() => $('#splash')?.remove(), 800);
  document.documentElement.classList.toggle('in-telegram', inTelegram);
}

boot();
