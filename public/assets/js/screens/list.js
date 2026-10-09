// Экран категории / подборки: липкие вкладки подкатегорий, сортировка, фильтр по брендам

import { esc, icon, pl, ITEMS } from '../util.js';
import { catsById, productsByCat, collection, groupItems } from '../data.js';
import { screenEl, appbar, bindScroll, gridHTML, emptyHTML, openSheet } from '../ui.js';
import { haptic } from '../tg.js';

const SORTS = [
  { id: 'default', title: 'По умолчанию' },
  { id: 'cheap', title: 'Сначала дешевле' },
  { id: 'expensive', title: 'Сначала дороже' },
  { id: 'name', title: 'По названию' },
];

function notFound() {
  const el = screenEl();
  el.innerHTML = `${appbar({ title: 'Не найдено' })}<div class="screen__body">${emptyHTML({
    art: '🧺',
    title: 'Такой подборки нет',
    text: 'Возможно, она закончилась. Загляните в каталог — там много всего.',
    btn: `<button class="btn btn--primary" data-act="tab" data-to="catalog">В каталог</button>`,
  })}</div>`;
  return { el };
}

export function categoryScreen(params) {
  const c = catsById.get(params.id);
  if (!c) return notFound();
  return listScreen({ title: c.title, items: productsByCat.get(c.id) || [], groupBy: 'sub', initial: params.sub });
}

export function collectionScreen(params) {
  const col = collection(params.id);
  if (!col) return notFound();
  return listScreen({ title: col.full || col.title, items: col.items, groupBy: col.groupBy });
}

function listScreen({ title, items, groupBy, initial }) {
  const el = screenEl();
  let sort = 'default';
  let brands = new Set();

  el.innerHTML = `${appbar({
    title,
    sub: pl(items.length, ITEMS),
    actions: `<button class="iconbtn" data-act="go" data-to="/search" aria-label="Поиск">${icon('search')}</button>
      <button class="iconbtn" data-do="filter" aria-label="Сортировка и фильтры">${icon('sort')}<span class="dot" hidden></span></button>`,
  })}
  <div class="screen__body">
    <div class="chips chips--sticky" role="tablist" aria-label="Подкатегории"></div>
    <div data-sections></div>
  </div>`;

  const body = el.querySelector('.screen__body');
  const chips = el.querySelector('.chips');
  const sections = el.querySelector('[data-sections]');
  let groupEls = [];
  let active = '';

  function sorted(list) {
    const arr = [...list];
    if (sort === 'cheap') arr.sort((a, b) => a.p - b.p);
    else if (sort === 'expensive') arr.sort((a, b) => b.p - a.p);
    else if (sort === 'name') arr.sort((a, b) => a.n.localeCompare(b.n, 'ru'));
    return arr;
  }

  function render() {
    const filtered = brands.size ? items.filter((p) => brands.has(p.b || '—')) : items;
    const groups = groupItems(filtered, groupBy).map((g) => ({ ...g, items: sorted(g.items) }));
    el.querySelector('.dot').hidden = sort === 'default' && !brands.size;
    const sub = el.querySelector('.appbar__title small');
    if (sub) sub.textContent = brands.size ? `${filtered.length} из ${pl(items.length, ITEMS)}` : pl(items.length, ITEMS);
    chips.hidden = groups.length < 2;
    chips.innerHTML = groups
      .map((g) => `<button class="chip" role="tab" data-chip="${g.id}">${esc(g.name)}</button>`)
      .join('');
    if (!filtered.length) {
      sections.innerHTML = emptyHTML({
        art: '🔎',
        title: 'Ничего не нашлось',
        text: 'Под выбранные фильтры товаров нет',
        btn: `<button class="btn btn--soft" data-do="reset">Сбросить фильтры</button>`,
      });
    } else {
      sections.innerHTML = groups
        .map(
          (g) => `<section class="psection" data-group="${g.id}">
          <h2 class="psection__title">${esc(g.name)} <span>${g.items.length}</span></h2>${gridHTML(g.items)}</section>`
        )
        .join('');
    }
    groupEls = [...sections.querySelectorAll('[data-group]')];
    active = '';
    if (el.isConnected) spy(); // до монтирования offsetTop ещё нулевые
  }

  function setActive(id) {
    if (id === active) return;
    active = id;
    chips.querySelectorAll('.chip').forEach((c) => {
      const on = c.dataset.chip === id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', String(on));
      if (on) chips.scrollTo({ left: c.offsetLeft - (chips.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
    });
  }

  function spy() {
    if (!groupEls.length) return;
    const y = body.scrollTop + (chips.hidden ? 0 : chips.offsetHeight) + 24;
    let cur = groupEls[0];
    for (const g of groupEls) {
      if (g.offsetTop <= y) cur = g;
      else break;
    }
    setActive(cur.dataset.group);
    chips.classList.toggle('is-stuck', body.scrollTop > chips.offsetTop - 1 && !chips.hidden);
  }

  function scrollToGroup(id, smooth = true) {
    const g = sections.querySelector(`[data-group="${id}"]`);
    if (!g) return;
    body.scrollTo({ top: g.offsetTop - chips.offsetHeight + 4, behavior: smooth ? 'smooth' : 'auto' });
    setActive(id);
  }

  bindScroll(el, spy);

  el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      haptic.select();
      scrollToGroup(chip.dataset.chip);
      return;
    }
    const d = e.target.closest('[data-do]');
    if (!d) return;
    if (d.dataset.do === 'filter') openFilter();
    if (d.dataset.do === 'reset') {
      brands = new Set();
      sort = 'default';
      render();
    }
  });

  function openFilter() {
    const counts = new Map();
    for (const p of items) counts.set(p.b || '—', (counts.get(p.b || '—') || 0) + 1);
    const brandList = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    let tmpSort = sort;
    const tmpBrands = new Set(brands);
    const countFiltered = () => (tmpBrands.size ? items.filter((p) => tmpBrands.has(p.b || '—')).length : items.length);
    const bodyHTML = () => `
      <div class="opts" role="radiogroup">${SORTS.map(
        (s) => `<button class="opt ${tmpSort === s.id ? 'on' : ''}" style="min-height:52px" data-sort="${s.id}" role="radio" aria-checked="${tmpSort === s.id}">
          <span class="opt__txt"><span class="opt__title" style="font-weight:500">${s.title}</span></span><span class="radio"></span></button>`
      ).join('')}</div>
      ${
        brandList.length > 1
          ? `<h3 class="h2">Бренды</h3><div class="qchips" style="padding:0">${brandList
              .map(
                ([b, n]) => `<button class="chip ${tmpBrands.has(b) ? 'on' : ''}" data-brand="${esc(b)}" aria-pressed="${tmpBrands.has(b)}">${esc(b === '—' ? 'Без бренда' : b)} <small>${n}</small></button>`
              )
              .join('')}</div>`
          : ''
      }`;
    const footHTML = () => `<div class="btnrow"><button class="btn btn--ghost" data-f="reset" style="flex:0 0 auto;width:auto">Сбросить</button>
      <button class="btn btn--primary" data-f="apply">Показать ${pl(countFiltered(), ITEMS)}</button></div>`;
    const sheet = openSheet({ title: 'Сортировка и фильтры', body: bodyHTML(), foot: footHTML() });
    const refresh = () => {
      const top = sheet.body.scrollTop;
      sheet.setBody(bodyHTML());
      sheet.body.scrollTop = top;
      sheet.foot.innerHTML = footHTML();
    };
    sheet.el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sort]');
      const b = e.target.closest('[data-brand]');
      const f = e.target.closest('[data-f]');
      if (s) {
        tmpSort = s.dataset.sort;
        haptic.select();
        refresh();
      } else if (b) {
        const name = b.dataset.brand;
        tmpBrands.has(name) ? tmpBrands.delete(name) : tmpBrands.add(name);
        haptic.select();
        refresh();
      } else if (f?.dataset.f === 'reset') {
        tmpSort = 'default';
        tmpBrands.clear();
        refresh();
      } else if (f?.dataset.f === 'apply') {
        sort = tmpSort;
        brands = new Set(tmpBrands);
        sheet.close();
        render();
        body.scrollTo({ top: 0 });
      }
    });
  }

  render();

  return {
    el,
    onMount() {
      if (initial) scrollToGroup(initial, false);
      spy();
    },
  };
}
