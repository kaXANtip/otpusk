// Профиль и избранное

import { esc, icon, pl, fmtPhone } from '../util.js';
import { shop } from '../data.js';
import { favs, orders, addresses, contact, on } from '../store.js';
import { screenEl, appbar, bindScroll, gridHTML, emptyHTML } from '../ui.js';
import { tgUser, openLink, inTelegram } from '../tg.js';
import { openAddressPicker, openContactEditor, openDeliveryInfo } from './sheets.js';

export function profileScreen() {
  const el = screenEl();
  const u = tgUser();

  function render() {
    const c = contact.get();
    const name = c.name || [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Гость';
    const initial = (name[0] || 'О').toUpperCase();
    const a = addresses.current();
    const sup = shop.support || {};
    const tgSupport = sup.telegram ? `https://t.me/${sup.telegram.replace(/^@/, '')}` : '';
    const orderCount = orders.list().length;
    const favCount = favs.count();
    el.querySelector('.screen__body').innerHTML = `
      <div class="profile-head">
        <div class="avatar">${u?.photo_url ? `<img src="${esc(u.photo_url)}" alt="">` : esc(initial)}</div>
        <div><div class="profile-head__name">${esc(name)}</div>
        <div class="profile-head__sub">${u?.username ? '@' + esc(u.username) : c.phone ? esc(fmtPhone(c.phone)) : inTelegram ? '' : 'Откройте в Telegram, чтобы синхронизировать данные'}</div></div>
      </div>
      <div class="qtiles">
        <button class="qtile" data-act="go" data-to="/orders"><span class="qtile__icon">${icon('box')}</span>
          <span class="qtile__title">Мои заказы</span><span class="qtile__sub">${orderCount ? pl(orderCount, ['заказ', 'заказа', 'заказов']) : 'пока нет'}</span></button>
        <button class="qtile" data-act="go" data-to="/favorites"><span class="qtile__icon">${icon('heart')}</span>
          <span class="qtile__title">Избранное</span><span class="qtile__sub">${favCount ? pl(favCount, ['товар', 'товара', 'товаров']) : 'пока пусто'}</span></button>
      </div>
      <div class="group" style="margin:0 16px">
        <button class="row" data-do="addr"><span class="row__icon">${icon('pin')}</span>
          <span class="row__txt"><span class="row__title" style="display:block">Адреса доставки</span><span class="row__sub" style="display:block">${a ? esc(a.street) : 'Добавьте адрес'}</span></span><span class="row__end">${icon('right', 'i--sm')}</span></button>
        <button class="row" data-do="contact"><span class="row__icon">${icon('user')}</span>
          <span class="row__txt"><span class="row__title" style="display:block">Контактные данные</span><span class="row__sub" style="display:block">${c.phone ? esc(fmtPhone(c.phone)) : 'Имя и телефон для курьера'}</span></span><span class="row__end">${icon('right', 'i--sm')}</span></button>
        <button class="row" data-do="info"><span class="row__icon">${icon('truck')}</span>
          <span class="row__txt"><span class="row__title" style="display:block">Условия доставки</span><span class="row__sub" style="display:block">Время работы, стоимость, оплата</span></span><span class="row__end">${icon('right', 'i--sm')}</span></button>
      </div>
      ${
        tgSupport || sup.phone || shop.botLink
          ? `<div class="group" style="margin:12px 16px 0">
        ${tgSupport ? `<button class="row" data-link="${esc(tgSupport)}"><span class="row__icon">${icon('chat')}</span><span class="row__txt"><span class="row__title" style="display:block">Написать в поддержку</span><span class="row__sub" style="display:block">Ответим в Telegram</span></span><span class="row__end">${icon('right', 'i--sm')}</span></button>` : ''}
        ${sup.phone ? `<a class="row" href="tel:${esc(sup.phone.replace(/[^\d+]/g, ''))}" style="color:inherit"><span class="row__icon">${icon('call')}</span><span class="row__txt"><span class="row__title" style="display:block">Позвонить</span><span class="row__sub" style="display:block">${esc(sup.phone)}</span></span><span class="row__end">${icon('right', 'i--sm')}</span></a>` : ''}
        ${shop.botLink ? `<button class="row" data-link="https://t.me/share/url?url=${encodeURIComponent(shop.botLink)}&text=${encodeURIComponent('Доставка продуктов «Отпуск» — попробуй!')}"><span class="row__icon">${icon('share')}</span><span class="row__txt"><span class="row__title" style="display:block">Рассказать друзьям</span><span class="row__sub" style="display:block">Поделиться ссылкой на магазин</span></span><span class="row__end">${icon('right', 'i--sm')}</span></button>` : ''}
      </div>`
          : ''
      }
      <div class="appfoot"><img src="/assets/img/logo-sm.png" alt="Отпуск" width="87" height="26">${esc(shop.tagline || '')}</div>`;
  }

  el.innerHTML = `${appbar({ title: 'Профиль', back: false })}<div class="screen__body"></div>`;
  render();
  bindScroll(el);
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-do]');
    const l = e.target.closest('[data-link]');
    if (l) return openLink(l.dataset.link);
    if (!d) return;
    if (d.dataset.do === 'addr') openAddressPicker();
    if (d.dataset.do === 'contact') openContactEditor({ onDone: render });
    if (d.dataset.do === 'info') openDeliveryInfo();
  });
  const offs = [on('addr', render), on('favs', render), on('orders', render), on('sync', render)];
  return { el, onShow: render, destroy: () => offs.forEach((f) => f()) };
}

export function favoritesScreen() {
  const el = screenEl();
  el.innerHTML = `${appbar({ title: 'Избранное' })}<div class="screen__body"></div>`;
  const body = el.querySelector('.screen__body');
  function render() {
    const list = favs.list();
    body.innerHTML = list.length
      ? `<div style="padding-top:4px">${gridHTML(list)}</div>`
      : emptyHTML({
          art: '💚',
          title: 'Здесь будет любимое',
          text: 'Нажимайте на сердечко у товаров — так их будет проще найти в следующий раз.',
          btn: `<button class="btn btn--primary" data-act="tab" data-to="catalog">В каталог</button>`,
        });
  }
  render();
  bindScroll(el);
  // убираем снятые с избранного товары только при повторном показе — чтобы сетка не прыгала
  return { el, onShow: render };
}
