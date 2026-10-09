// Главная: адрес, поиск, подборки, баннеры, категории, витрины

import { esc, icon, money, pl, ITEMS } from '../util.js';
import { shop, categories, productsByCat, collection, sampleCategory, openState, freeFrom, diverse } from '../data.js';
import { addresses, on } from '../store.js';
import { screenEl, bindScroll, sectionHTML, railHTML } from '../ui.js';

// раскладка плиток категорий: 2+1, 1+1+1, 1+2, 1+1+1, 2+1
const WIDE = [0, 6, 10];

export function etaHTML() {
  const s = openState();
  if (s.asap) return `<span class="eta">${icon('zap')}${esc(shop.eta)}</span>`;
  return `<span class="eta is-closed">${icon('clock', 'i--sm')}${s.beforeOpen ? 'с ' : 'завтра с '}${esc(s.open)}</span>`;
}

function addrHTML() {
  const a = addresses.current();
  return `<span class="addr__pin">${icon('pin')}</span>
    <span class="addr__txt"><span class="addr__label">${a ? 'Доставим по адресу' : `Доставка · ${esc((shop.cities || [])[0] || '')}`}</span>
    <span class="addr__value ${a ? '' : 'is-empty'}">${a ? esc(a.street) : 'Укажите адрес доставки'}</span></span>
    ${icon('down', 'i--sm')}`;
}

function bentoHTML() {
  // порядок ширины: первая плитка широкая, затем чередуем ряды
  const tiles = [];
  let col = 0;
  categories.forEach((c, i) => {
    let span = WIDE.includes(i) && col < 2 ? 2 : 1; // широкая не влезает в конец ряда
    if (i === categories.length - 1) span = 3 - col; // последняя добивает ряд
    const wide = span > 1;
    const n = productsByCat.get(c.id)?.length || 0;
    tiles.push(`<button class="tile t-${c.tone} ${wide ? 'tile--wide' : ''}" style="grid-column:span ${span}" data-act="go" data-to="/category/${c.id}">
      <div class="tile__name">${esc(c.short || c.title)}</div>
      ${wide ? `<div class="tile__count">${pl(n, ITEMS)}</div>` : ''}
      <span class="tile__art" aria-hidden="true">${c.emoji}</span></button>`);
    col = (col + span) % 3;
  });
  return `<div class="bento">${tiles.join('')}</div>`;
}

export default function home() {
  const el = screenEl();
  const deals = collection('deals');
  const local = collection('local');
  const free = freeFrom();
  const dealsRail = deals ? diverse(deals.items, 14) : [];
  // в «Крыму» сначала то, чего нет среди «выгодных», — витрины не повторяют друг друга
  const localRail = local
    ? diverse([...local.items.filter((p) => !p.a), ...local.items.filter((p) => p.a)], 14, new Set(dealsRail.map((p) => p.id)))
    : [];

  const rails = categories
    .map((c) => sectionHTML(c.short && c.short.length < 18 ? c.short : c.title, railHTML(sampleCategory(c.id, 12), `/category/${c.id}`), `/category/${c.id}`))
    .join('');

  el.innerHTML = `<div class="screen__body">
    <div class="home-top">
      <img class="home-top__logo" src="/assets/img/logo-sm.png" alt="Отпуск" width="121" height="36">
      <span data-eta>${etaHTML()}</span>
    </div>
    <button class="addr" data-act="addr" aria-label="Адрес доставки">${addrHTML()}</button>
    <div class="sticky-search">
      <button class="searchbox" data-act="go" data-to="/search">${icon('search')}<span>Найти молоко, хлеб, мороженое…</span></button>
    </div>

    <div class="stories" role="list">
      ${shop.collections
        .map(
          (c) => `<button class="story" role="listitem" data-act="go" data-to="/collection/${c.id}">
            <span class="story__art t-${c.tone}" aria-hidden="true">${c.emoji}</span><span class="story__name">${esc(c.title)}</span></button>`
        )
        .join('')}
    </div>

    <div class="banners">
      ${(shop.banners || [])
        .map(
          (b) => `<button class="banner banner--${b.theme || 'green'}" data-act="go" data-to="${esc(b.to || '/catalog')}">
            <div><div class="banner__title">${esc(b.title)}</div><div class="banner__text">${esc(b.text)}</div></div>
            <span class="banner__cta">Смотреть${icon('right', 'i--xs')}</span>
            <span class="banner__art" aria-hidden="true">${b.emoji}</span></button>`
        )
        .join('')}
    </div>

    ${sectionHTML('Каталог', bentoHTML(), '/catalog')}
    ${dealsRail.length ? sectionHTML('Выгодно каждый день', railHTML(dealsRail, '/collection/deals'), '/collection/deals') : ''}
    ${localRail.length ? sectionHTML('Сделано в Крыму', railHTML(localRail, '/collection/local'), '/collection/local') : ''}
    ${rails}

    <div class="infocard">
      <div class="inforow">${icon('clock')}<div><b>Ежедневно ${esc(shop.hours.open)}–${esc(shop.hours.close)}</b><br><span class="muted">Привезём за ${esc(shop.eta)} или ко времени</span></div></div>
      <div class="inforow">${icon('truck')}<div><b>${free != null ? `Бесплатная доставка от ${money(free)}` : 'Доставка по городу'}</b><br><span class="muted">Минимальный заказ — ${money(shop.minOrder)}</span></div></div>
      <button class="section__more" data-act="info" style="justify-self:start;padding-left:0">Условия доставки${icon('right', 'i--sm')}</button>
    </div>
  </div>`;

  const sticky = el.querySelector('.sticky-search');
  bindScroll(el, (y) => sticky.classList.toggle('is-stuck', y > sticky.offsetTop - 2));

  const offAddr = on('addr', () => {
    el.querySelector('.addr').innerHTML = addrHTML();
  });
  const tick = setInterval(() => {
    el.querySelector('[data-eta]').innerHTML = etaHTML();
  }, 60000);

  return {
    el,
    destroy() {
      offAddr();
      clearInterval(tick);
    },
  };
}
