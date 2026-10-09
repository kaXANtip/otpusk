// История заказов и детали заказа

import { esc, icon, money, fmtDate, pl, ITEMS } from '../util.js';
import { shop, byId } from '../data.js';
import { orders, cart } from '../store.js';
import { screenEl, appbar, bindScroll, phHTML, emptyHTML, toast, syncAllProducts } from '../ui.js';
import { switchTab } from '../router.js';
import { haptic, openLink } from '../tg.js';

function thumb(it) {
  const p = byId.get(it.id) || { id: it.id, c: '', s: '', n: it.n };
  return `<div class="ocard__thumb">${phHTML(p)}</div>`;
}

function statusHTML(o) {
  if (o.demo) return '<span class="status status--demo">Тестовый</span>';
  return '<span class="status">Оформлен</span>';
}

export function ordersScreen() {
  const el = screenEl();
  const list = orders.list();
  el.innerHTML = `${appbar({ title: 'Мои заказы' })}
    <div class="screen__body">
      ${
        list.length
          ? `<div class="pad" style="padding-top:4px">${list
              .map((o) => {
                const count = o.items.reduce((a, b) => a + b.qty, 0);
                return `<button class="ocard" data-act="go" data-to="/order/${esc(o.id)}">
              <div class="ocard__top"><div><div class="ocard__id">Заказ №${esc(o.id)}</div><div class="ocard__date">${fmtDate(o.at)}</div></div>${statusHTML(o)}</div>
              <div class="ocard__thumbs">${o.items.slice(0, 5).map(thumb).join('')}${o.items.length > 5 ? `<div class="ocard__more">+${o.items.length - 5}</div>` : ''}</div>
              <div class="ocard__bottom"><span class="muted" style="font-size:14px">${pl(count, ITEMS)}</span><span class="ocard__sum">${money(o.total)}</span></div>
            </button>`;
              })
              .join('')}</div>`
          : emptyHTML({
              art: '📦',
              title: 'Заказов пока нет',
              text: 'Здесь появится история ваших покупок — любой заказ можно будет повторить в одно касание.',
              btn: `<button class="btn btn--primary" data-act="tab" data-to="catalog">Выбрать продукты</button>`,
            })
      }
    </div>`;
  bindScroll(el);
  return { el };
}

export function repeatOrder(o) {
  let added = 0;
  let missing = 0;
  for (const it of o.items) {
    if (byId.has(it.id)) {
      cart.set(it.id, Math.max(cart.qty(it.id), it.qty));
      added++;
    } else missing++;
  }
  syncAllProducts();
  if (added) {
    haptic.success();
    toast(missing ? `Добавили ${pl(added, ITEMS)}. ${pl(missing, ITEMS)} больше нет в продаже` : `Добавили ${pl(added, ITEMS)} в корзину`, { type: 'ok' });
    switchTab('cart', { reset: true });
  } else {
    haptic.error();
    toast('Этих товаров больше нет в продаже', { type: 'err' });
  }
}

export function orderScreen(params) {
  const el = screenEl();
  const o = orders.get(params.id);
  if (!o) {
    el.innerHTML = `${appbar({ title: 'Заказ' })}<div class="screen__body">${emptyHTML({ art: '🔎', title: 'Заказ не найден', text: 'Возможно, он был оформлен на другом устройстве.' })}</div>`;
    return { el };
  }
  const support = shop.support?.telegram ? `https://t.me/${shop.support.telegram.replace(/^@/, '')}` : '';
  el.innerHTML = `${appbar({ title: `Заказ №${o.id}`, sub: fmtDate(o.at) })}
    <div class="screen__body has-foot">
      <div class="pad" style="display:flex;justify-content:space-between;align-items:center;padding-top:4px">${statusHTML(o)}
        <span class="hint">${o.demo ? 'не отправлен оператору' : 'статус придёт в Telegram'}</span></div>
      <div class="group" style="margin:14px 16px 0">
        <div class="row"><span class="row__icon">${icon('clock')}</span><div class="row__txt"><div class="row__sub">Когда</div><div class="row__title">${esc(o.when)}</div></div></div>
        <div class="row"><span class="row__icon">${icon('pin')}</span><div class="row__txt"><div class="row__sub">Адрес</div><div class="row__title" style="white-space:normal">${esc(o.address)}</div></div></div>
        <div class="row"><span class="row__icon">${icon('card')}</span><div class="row__txt"><div class="row__sub">Оплата при получении</div><div class="row__title">${esc(o.payment)}</div></div></div>
      </div>
      <h2 class="h2 pad">Состав заказа</h2>
      <div class="citems">${o.items
        .map((it) => {
          const p = byId.get(it.id);
          const ph = p ? phHTML(p) : `<div class="ph t-mint"><span class="ph__e">🛒</span></div>`;
          return `<div class="citem" style="animation:none">
            <div class="citem__media">${ph}</div>
            <div class="citem__main"><div class="citem__name">${esc(it.n)}</div>
              <div class="citem__meta">${esc(it.w)}${it.w ? ' · ' : ''}${it.qty} × ${money(it.p)}${p ? '' : ' · нет в продаже'}</div>
              <div class="citem__row"><span></span><span class="citem__price">${money(it.p * it.qty)}</span></div></div></div>`;
        })
        .join('')}</div>
      <div class="summary">
        <div class="summary__row"><span>Товары</span><span class="num">${money(o.subtotal)}</span></div>
        <div class="summary__row ${o.fee ? '' : 'is-free'}"><span>Доставка</span><span class="num">${o.fee ? money(o.fee) : 'бесплатно'}</span></div>
        ${o.discount ? `<div class="summary__row is-discount"><span>Скидка</span><span class="num">−${money(o.discount)}</span></div>` : ''}
        <div class="summary__total"><span>Итого</span><span class="num">${money(o.total)}</span></div>
      </div>
      ${support ? `<div class="pad" style="margin-top:12px"><button class="btn btn--ghost" data-do="support">${icon('help')}Написать в поддержку</button></div>` : ''}
    </div>
    <div class="footbar"><button class="btn btn--primary" data-do="repeat">${icon('repeat')}Повторить заказ</button></div>`;
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-do]');
    if (d?.dataset.do === 'repeat') repeatOrder(o);
    if (d?.dataset.do === 'support') openLink(support);
  });
  bindScroll(el);
  return { el };
}
