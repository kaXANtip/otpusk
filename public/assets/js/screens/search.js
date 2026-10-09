// Поиск: мгновенные результаты, история, популярные запросы, исправление раскладки

import { esc, icon, debounce, pl, ITEMS } from '../util.js';
import { shop, categories, search, searchSubs } from '../data.js';
import { recent } from '../store.js';
import { screenEl, gridHTML, emptyHTML } from '../ui.js';
import { hasNativeBack } from '../tg.js';

const PAGE = 60;

export default function searchScreen(params) {
  const el = screenEl();
  el.innerHTML = `<div class="searchbar ${hasNativeBack ? '' : 'has-back'}">
      ${hasNativeBack ? '' : `<button class="iconbtn" data-act="back" aria-label="Назад">${icon('back')}</button>`}
      <label class="searchfield">${icon('search')}
        <input type="search" placeholder="Найти продукты" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Поиск товаров">
        <button class="clearbtn" data-do="clear" hidden aria-label="Очистить">${icon('x')}</button>
      </label>
    </div>
    <div class="screen__body"><div data-out></div></div>`;

  const input = el.querySelector('input');
  const out = el.querySelector('[data-out]');
  const body = el.querySelector('.screen__body');
  const clearBtn = el.querySelector('[data-do="clear"]');
  let limit = PAGE;
  let q = '';
  let results = [];
  let usedQuery = '';

  function idle() {
    const rec = recent.list();
    out.innerHTML = `
      ${
        rec.length
          ? `<div class="section__head" style="padding-top:12px"><h2 class="section__title" style="font-size:17px">Вы искали</h2>
             <button class="textbtn" data-do="clear-recent">Очистить</button></div>
             <div class="qchips">${rec.map((r) => `<button class="qchip" data-q="${esc(r)}">${icon('clock')}${esc(r)}</button>`).join('')}</div>`
          : ''
      }
      <div class="section__head" style="padding-top:20px"><h2 class="section__title" style="font-size:17px">Часто ищут</h2></div>
      <div class="qchips">${(shop.popular || []).map((r) => `<button class="qchip" data-q="${esc(r)}">${icon('search')}${esc(r)}</button>`).join('')}</div>
      <div class="section__head" style="padding-top:24px"><h2 class="section__title" style="font-size:17px">Категории</h2></div>
      <div class="catlist">${categories
        .map(
          (c) => `<button class="catrow" data-act="go" data-to="/category/${c.id}">
          <span class="catrow__art t-${c.tone}" style="width:48px;height:48px;font-size:26px" aria-hidden="true">${c.emoji}</span>
          <span class="catrow__txt"><span class="catrow__name" style="font-size:15px">${esc(c.title)}</span></span>${icon('right', 'i--sm')}</button>`
        )
        .join('')}</div>`;
  }

  function show() {
    if (!q.trim()) return idle();
    if (!results.length) {
      out.innerHTML = emptyHTML({
        art: '🤷',
        title: 'Ничего не нашли',
        text: `По запросу «${q.trim()}» товаров нет. Попробуйте написать иначе или загляните в каталог.`,
        btn: `<div class="qchips" style="justify-content:center;margin-top:20px;padding:0">${(shop.popular || [])
          .slice(0, 6)
          .map((r) => `<button class="qchip" data-q="${esc(r)}">${esc(r)}</button>`)
          .join('')}</div>`,
      });
      return;
    }
    const subs = searchSubs(q, results);
    const shown = results.slice(0, limit);
    out.innerHTML = `
      ${usedQuery ? `<div class="search-note">Показаны результаты по запросу <b>«${esc(usedQuery)}»</b></div>` : ''}
      ${
        subs.length > 1
          ? `<div class="chips" style="padding-top:2px;padding-bottom:12px">${subs
              .map((s) => `<button class="chip" data-act="go" data-to="/category/${s.cat}?sub=${s.id}">${s.emoji} ${esc(s.name)}</button>`)
              .join('')}</div>`
          : ''
      }
      <div class="search-note" style="padding-bottom:12px">${pl(results.length, ['товар найден', 'товара найдено', 'товаров найдено'])}</div>
      ${gridHTML(shown, { hl: usedQuery || q })}
      ${results.length > limit ? `<div class="pad" style="padding-top:20px"><button class="btn btn--ghost" data-do="more">Показать ещё ${Math.min(PAGE, results.length - limit)}</button></div>` : ''}`;
  }

  const update = () => {
    q = input.value;
    clearBtn.hidden = !q;
    const r = search(q);
    results = r.items;
    usedQuery = r.used;
    limit = PAGE;
    show();
    body.scrollTop = 0;
  };
  const updateSoon = debounce(update, 110);

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    updateSoon();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      recent.push(input.value);
      input.blur();
    }
  });
  // при прокрутке прячем клавиатуру, как в нативных приложениях
  body.addEventListener('touchstart', () => document.activeElement === input && input.blur(), { passive: true });

  el.addEventListener('click', (e) => {
    const qb = e.target.closest('[data-q]');
    const d = e.target.closest('[data-do]');
    if (qb) {
      input.value = qb.dataset.q;
      recent.push(qb.dataset.q);
      update();
      return;
    }
    if (d?.dataset.do === 'clear') {
      input.value = '';
      update();
      input.focus();
    } else if (d?.dataset.do === 'clear-recent') {
      recent.clear();
      idle();
    } else if (d?.dataset.do === 'more') {
      limit += PAGE;
      show();
    }
    if (q.trim() && e.target.closest('.pcard')) recent.push(q);
  });

  if (params.q) {
    input.value = params.q;
    update();
  } else idle();

  return {
    el,
    onMount() {
      if (!params.q) input.focus({ preventScroll: true });
    },
  };
}
