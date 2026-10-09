// Вкладка «Каталог»: все категории и подборки

import { esc, icon, pl, ITEMS } from '../util.js';
import { shop, categories, productsByCat } from '../data.js';
import { screenEl, appbar, bindScroll } from '../ui.js';

export default function catalog() {
  const el = screenEl();
  el.innerHTML = `${appbar({ title: 'Каталог', back: false, actions: `<button class="iconbtn" data-act="go" data-to="/search" aria-label="Поиск">${icon('search')}</button>` })}
  <div class="screen__body">
    <div class="pad" style="padding-bottom:6px">
      <button class="searchbox" data-act="go" data-to="/search">${icon('search')}<span>Поиск по ${pl(categories.reduce((a, c) => a + (productsByCat.get(c.id)?.length || 0), 0), ITEMS)}</span></button>
    </div>
    <div class="stories" role="list" style="padding-top:10px">
      ${shop.collections
        .map(
          (c) => `<button class="story" role="listitem" data-act="go" data-to="/collection/${c.id}">
          <span class="story__art t-${c.tone}" aria-hidden="true">${c.emoji}</span><span class="story__name">${esc(c.title)}</span></button>`
        )
        .join('')}
    </div>
    <div class="catlist" style="margin-top:12px">
      ${categories
        .map(
          (c) => `<button class="catrow" data-act="go" data-to="/category/${c.id}">
          <span class="catrow__art t-${c.tone}" aria-hidden="true">${c.emoji}</span>
          <span class="catrow__txt"><span class="catrow__name">${esc(c.title)}</span>
          <span class="catrow__sub" style="display:block">${esc(c.subs.map((s) => s.name).join(' · '))}</span></span>
          ${icon('right', 'i--sm')}</button>`
        )
        .join('')}
    </div>
  </div>`;
  bindScroll(el);
  return { el };
}
