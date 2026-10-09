// Карточка товара в шторке

import { esc, icon, money } from '../util.js';
import { byId, products, productsBySub, catOf, subOf, unitPrice } from '../data.js';
import { favs, recent } from '../store.js';
import { openSheet, phHTML, badgeHTML, ctlHTML, railHTML } from '../ui.js';
import { go } from '../router.js';

let current = null;

function bodyHTML(p) {
  const cat = catOf(p);
  const sub = subOf(p);
  const unit = unitPrice(p);
  const similar = (productsBySub.get(p.s) || []).filter((x) => x.id !== p.id).slice(0, 12);
  const brandMore = p.b ? products.filter((x) => x.b === p.b && x.id !== p.id && x.s !== p.s).slice(0, 12) : [];
  const amountLabel = p.u === 'шт' ? 'Количество' : p.u === 'мл' ? 'Объём' : 'Вес';
  return `
    <div class="pd__media">${phHTML(p)}${badgeHTML(p)}
      <button class="sheet__close" data-sheet-close aria-label="Закрыть">${icon('x')}</button></div>
    <div class="pd__info">
      <h2 class="pd__name">${esc(p.n)}</h2>
      ${p.w || unit ? `<div class="pd__meta">${p.w ? `<span>${esc(p.w)}</span>` : ''}${unit ? `<span>${unit}</span>` : ''}</div>` : ''}
      <div class="pd__price"><b>${money(p.p)}</b>${p.o ? `<s>${money(p.o)}</s>` : ''}</div>
    </div>
    ${p.d ? `<p class="pd__desc">${esc(p.d)}</p>` : ''}
    <div class="pd__facts">
      <div class="pd__fact"><span>Категория</span><span><a href="#" data-pd="sub">${esc(cat?.title || '')} · ${esc(sub?.name || '')}</a></span></div>
      ${p.b ? `<div class="pd__fact"><span>Бренд</span><span><a href="#" data-pd="brand">${esc(p.b)}</a></span></div>` : ''}
      ${p.w ? `<div class="pd__fact"><span>${amountLabel}</span><span>${esc(p.w)}</span></div>` : ''}
      ${p.a ? `<div class="pd__fact"><span>Цена</span><span>Выгодная каждый день</span></div>` : ''}
      ${p.l ? `<div class="pd__fact"><span>Производство</span><span>Крым</span></div>` : ''}
    </div>
    ${similar.length ? `<section class="section"><div class="section__head"><h2 class="section__title">Похожие товары</h2></div>${railHTML(similar)}</section>` : ''}
    ${brandMore.length ? `<section class="section"><div class="section__head"><h2 class="section__title">Ещё от «${esc(p.b)}»</h2></div>${railHTML(brandMore)}</section>` : ''}
  `;
}

function footHTML(p) {
  const on = favs.has(p.id);
  return `<div class="pd__foot">
    <button class="pd__fav ${on ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-pressed="${on}" aria-label="Избранное">${icon('heart')}</button>
    <div style="flex:1;min-width:0" data-ctl="${p.id}" data-variant="lg">${ctlHTML(p, 'lg')}</div>
  </div>`;
}

export function openProduct(id, { query = '' } = {}) {
  const p = byId.get(id);
  if (!p) return;
  if (query) recent.push(query);
  if (current) {
    current.p = p;
    current.sheet.setBody(bodyHTML(p));
    current.sheet.foot.innerHTML = footHTML(p);
    current.sheet.body.scrollTo({ top: 0 });
    return;
  }
  const sheet = openSheet({
    body: bodyHTML(p),
    foot: footHTML(p),
    flush: true,
    cls: 'sheet--product',
    label: p.n,
    onClose: () => {
      current = null;
    },
  });
  current = { sheet, p };
  sheet.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-pd]');
    if (!a) return;
    e.preventDefault();
    const cp = current.p;
    sheet.close();
    if (a.dataset.pd === 'sub') go(`/category/${cp.c}?sub=${cp.s}`);
    if (a.dataset.pd === 'brand') go(`/search?q=${encodeURIComponent(cp.b)}`);
  });
}
