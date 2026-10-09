// Вкладка «Корзина»

import { esc, icon, money, pl, ITEMS } from '../util.js';
import { shop, nextTier, collection } from '../data.js';
import { cart, prefs, on } from '../store.js';
import { screenEl, appbar, bindScroll, phHTML, ctlHTML, railHTML, sectionHTML, emptyHTML, confirmDialog, toast, syncAllProducts } from '../ui.js';
import { go } from '../router.js';
import { haptic } from '../tg.js';

const REPLACE = [
  { id: 'call', title: 'Позвонить мне' },
  { id: 'similar', title: 'Заменить похожим' },
  { id: 'remove', title: 'Убрать из заказа' },
];

export function deliveryCardHTML(t) {
  const nt = nextTier(t.subtotal);
  if (!t.minOk) {
    const need = shop.minOrder - t.subtotal;
    const pct = Math.min(1, t.subtotal / shop.minOrder);
    return `<div class="deliv">
      <div class="deliv__row">${icon('bag')}<span>Минимальная сумма заказа — <b>${money(shop.minOrder)}</b>. Добавьте ещё на <b class="num">${money(need)}</b></span></div>
      <div class="progress" aria-hidden="true"><div class="progress__bar" style="transform:scaleX(${pct})"></div></div></div>`;
  }
  if (nt) {
    const pct = Math.min(1, (t.subtotal - nt.base) / (nt.from - nt.base || 1));
    return `<div class="deliv">
      <div class="deliv__row">${icon('truck')}<span>Ещё <b class="num">${money(nt.need)}</b> — и доставка ${nt.fee ? `будет ${money(nt.fee)}` : '<b>бесплатно</b>'}</span></div>
      <div class="progress" aria-hidden="true"><div class="progress__bar" style="transform:scaleX(${pct})"></div></div></div>`;
  }
  return `<div class="deliv"><div class="deliv__row">${icon('check')}<span>${t.fee ? `Доставка — ${money(t.fee)}` : '<b>Доставка бесплатная</b> — приятного отпуска!'}</span></div></div>`;
}

export function summaryHTML(t, { compact = false } = {}) {
  return `<div class="summary" ${compact ? 'style="margin:0;background:var(--bg)"' : ''}>
    <div class="summary__row"><span>Товары, ${pl(t.count, ['шт.', 'шт.', 'шт.'])}</span><span class="num">${money(t.subtotal)}</span></div>
    <div class="summary__row ${t.fee ? '' : 'is-free'}"><span>Доставка</span><span class="num">${t.fee ? money(t.fee) : 'бесплатно'}</span></div>
    ${t.discount ? `<div class="summary__row is-discount"><span>Промокод ${esc(t.promo.code)}</span><span class="num">−${money(t.discount)}</span></div>` : ''}
    <div class="summary__total"><span>Итого</span><span class="num">${money(t.total)}</span></div>
  </div>`;
}

export default function cartScreen() {
  const el = screenEl();
  el.innerHTML = `${appbar({ title: 'Корзина', back: false, actions: `<button class="textbtn textbtn--danger" data-do="clear" hidden>Очистить</button>` })}
    <div class="screen__body"></div>
    <div class="footbar" hidden></div>`;
  const body = el.querySelector('.screen__body');
  const foot = el.querySelector('.footbar');
  const clearBtn = el.querySelector('[data-do="clear"]');
  let first = true;

  function suggestions() {
    const inCart = new Set(cart.ids());
    const deals = collection('deals')?.items || [];
    const seen = new Set();
    // по одному-два товара из разных подкатегорий — «не забудьте»
    const picks = [];
    for (const p of deals) {
      if (inCart.has(p.id) || seen.has(p.s)) continue;
      seen.add(p.s);
      picks.push(p);
      if (picks.length >= 12) break;
    }
    return picks;
  }

  function render() {
    const t = cart.totals();
    clearBtn.hidden = !t.lines.length;
    if (!t.lines.length) {
      foot.hidden = true;
      body.classList.remove('has-foot');
      const sugg = suggestions();
      body.innerHTML = `${emptyHTML({
        art: '🧺',
        title: 'В корзине пока пусто',
        text: 'Соберите продукты на неделю или перекус на вечер — привезём быстро.',
        btn: `<button class="btn btn--primary" data-act="tab" data-to="catalog">Перейти в каталог</button>`,
      })}${sugg.length ? sectionHTML('Выгодно каждый день', railHTML(sugg), '/collection/deals') : ''}`;
      return;
    }
    const pr = prefs.get();
    body.innerHTML = `
      ${deliveryCardHTML(t)}
      <div class="citems ${first ? '' : 'no-anim'}">
        ${t.lines
          .map(
            ({ p, qty, sum }) => `<div class="citem" data-pid="${p.id}">
            <button class="citem__media" data-act="product" data-id="${p.id}" aria-label="${esc(p.n)}">${phHTML(p)}</button>
            <div class="citem__main">
              <button class="citem__name" data-act="product" data-id="${p.id}">${esc(p.n)}</button>
              <div class="citem__meta">${esc(p.w || '')}${p.w ? ' · ' : ''}${money(p.p)}/шт</div>
              <div class="citem__row">
                <div data-ctl="${p.id}" data-variant="row">${ctlHTML(p, 'row')}</div>
                <div class="citem__price">${money(sum)}</div>
              </div>
            </div>
          </div>`
          )
          .join('')}
      </div>
      ${(() => {
        const s = suggestions();
        return s.length ? sectionHTML('Не забудьте', railHTML(s)) : '';
      })()}
      <div class="pad" style="margin-top:20px">
        <div class="field"><span class="field__label" style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:10px">Если товара не окажется</span>
        <div class="seg" role="radiogroup">${REPLACE.map(
          (r) => `<button class="${pr.replace === r.id ? 'on' : ''}" data-replace="${r.id}" role="radio" aria-checked="${pr.replace === r.id}">${r.title}</button>`
        ).join('')}</div></div>
      </div>
      ${summaryHTML(t)}`;
    if (first) first = false;
    else body.querySelectorAll('.citem').forEach((c) => (c.style.animation = 'none'));

    foot.hidden = false;
    body.classList.add('has-foot');
    foot.innerHTML = `
      ${t.minOk ? '' : `<div class="footbar__note">До минимальной суммы заказа — ${money(shop.minOrder - t.subtotal)}</div>`}
      <button class="btn btn--primary btn--split ${t.minOk ? '' : 'is-disabled'}" data-do="checkout" ${t.minOk ? '' : 'aria-disabled="true"'}>
        <span>Оформить заказ</span><span class="btn__sub">${money(t.total)}</span></button>`;
  }

  el.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-do]');
    const r = e.target.closest('[data-replace]');
    if (r) {
      prefs.set({ replace: r.dataset.replace });
      haptic.select();
      el.querySelectorAll('[data-replace]').forEach((b) => {
        b.classList.toggle('on', b === r);
        b.setAttribute('aria-checked', String(b === r));
      });
      return;
    }
    if (!d) return;
    if (d.dataset.do === 'checkout') {
      if (!cart.totals().minOk) return haptic.warning();
      go('/checkout');
    } else if (d.dataset.do === 'clear') {
      const ok = await confirmDialog({ title: 'Очистить корзину?', text: 'Все товары будут удалены из корзины', ok: 'Очистить', danger: true });
      if (!ok) return;
      const snap = cart.clear();
      syncAllProducts();
      haptic.medium();
      toast('Корзина очищена', {
        action: {
          label: 'Вернуть',
          fn: () => {
            cart.restore(snap);
            syncAllProducts();
          },
        },
      });
    }
  });

  bindScroll(el);
  const off = on('cart', () => {
    const top = body.scrollTop;
    render();
    body.scrollTop = top;
  });
  render();

  return {
    el,
    onShow: () => render(),
    destroy: off,
  };
}
