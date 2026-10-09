// Оформление заказа

import { esc, icon, money, fmtPhone, phoneDigits, phoneValid } from '../util.js';
import { shop, openState, deliveryDays } from '../data.js';
import { cart, addresses, contact, prefs, promo, orders, addrLine, addrDetails, on } from '../store.js';
import { screenEl, appbar, bindScroll, phHTML, toast, syncAllProducts } from '../ui.js';
import { back, resetTo } from '../router.js';
import { haptic, initData, canRequestPhone, requestPhone } from '../tg.js';
import { api } from '../api.js';
import { summaryHTML } from './cart.js';
import { openAddressPicker, bindPhoneInput, fieldError } from './sheets.js';

export default function checkout() {
  const el = screenEl();
  const st = openState();
  const days = deliveryDays();
  const pr = prefs.get();
  const c = contact.get();
  let mode = st.asap ? 'asap' : 'slot';
  let dayIdx = 0;
  let slot = null;
  let payment = shop.payments.find((p) => p.id === pr.payment) ? pr.payment : shop.payments[0]?.id;
  let sending = false;

  el.innerHTML = `${appbar({ title: 'Оформление заказа' })}
  <div class="screen__body has-foot">
    <div class="co-block" data-block="addr">
      <div class="co-block__title">Адрес доставки</div>
      <div data-addr></div>
      <div class="row" style="margin-top:6px;border:0;min-height:48px;padding-bottom:0">
        <span class="row__icon">${icon('door')}</span>
        <div class="row__txt"><div class="row__title">Оставить у двери</div><div class="row__sub wrap">Курьер позвонит в дверь и уйдёт</div></div>
        <label class="switch"><input type="checkbox" data-door ${pr.door ? 'checked' : ''} aria-label="Оставить у двери"><span></span></label>
      </div>
    </div>

    <div class="co-block" data-block="when">
      <div class="co-block__title">Когда доставить</div>
      <div data-when></div>
    </div>

    <div class="co-block" data-block="contact">
      <div class="co-block__title">Получатель</div>
      <div class="form">
        <label class="field" data-f="name"><span class="field__label">Имя <b>*</b></span>
          <input class="input" name="name" value="${esc(c.name || '')}" autocomplete="given-name" placeholder="Как к вам обращаться" enterkeyhint="next"></label>
        <label class="field" data-f="phone"><span class="field__label">Телефон <b>*</b></span>
          <span class="inputwrap"><input class="input num" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(fmtPhone(c.phone))}" placeholder="+7 (978) 000-00-00" enterkeyhint="done">
          ${canRequestPhone ? `<button type="button" class="inputwrap__btn" data-do="tgphone" aria-label="Взять номер из Telegram">${icon('phone')}</button>` : ''}</span>
          ${canRequestPhone && !c.phone ? `<span class="field__help">Нажмите ${icon('phone', 'i--xs')} — подставим номер из Telegram</span>` : ''}</label>
      </div>
    </div>

    <div class="co-block" data-block="pay">
      <div class="co-block__title">Оплата при получении</div>
      <div class="opts" role="radiogroup" data-pay></div>
      <label class="field" data-change style="margin-top:12px" ${payment === 'cash' ? '' : 'hidden'}>
        <span class="field__label">С какой суммы подготовить сдачу?</span>
        <input class="input num" name="change" inputmode="numeric" value="${esc(pr.change || '')}" placeholder="Например, 5000"></label>
    </div>

    <div class="co-block">
      <div class="co-block__title">Комментарий к заказу</div>
      <textarea class="input" name="comment" rows="2" placeholder="Пожелания по товарам или доставке">${esc(pr.comment || '')}</textarea>
    </div>

    <div class="co-block" data-block="promo">
      <div class="co-block__title">Промокод</div>
      <div data-promo></div>
    </div>

    <div class="co-block">
      <div class="co-block__title">Ваш заказ <button class="textbtn" data-act="back" style="height:32px">Изменить</button></div>
      <div class="co-items" data-items></div>
      <div data-summary style="margin-top:14px"></div>
    </div>
    <p class="hint" style="text-align:center;padding:4px 24px 0">Оплата курьеру при получении. Если чего-то не окажется в наличии, сумма уменьшится.</p>
  </div>
  <div class="footbar"><button class="btn btn--primary btn--split" data-do="submit"><span>Подтвердить заказ</span><span class="btn__sub" data-total></span></button></div>`;

  const $ = (s) => el.querySelector(s);
  const nameIn = $('input[name="name"]');
  const phoneIn = $('input[name="phone"]');
  const commentIn = $('textarea[name="comment"]');
  const changeIn = $('input[name="change"]');
  bindPhoneInput(phoneIn);

  function renderAddr() {
    const a = addresses.current();
    $('[data-addr]').innerHTML = `<button class="addrcard ${a ? '' : 'is-empty'}" data-do="addr">
      <span class="addr__pin">${icon('pin')}</span>
      <span class="addrcard__txt"><span class="addrcard__main" style="display:block">${a ? esc(a.street) : 'Добавить адрес'}</span>
      <span class="addrcard__sub" style="display:block">${a ? esc(addrDetails(a)) : 'Улица, дом, квартира'}</span></span>${icon('right', 'i--sm')}</button>`;
  }

  function renderWhen() {
    const day = days[dayIdx];
    $('[data-when]').innerHTML = `
      <div class="seg" role="radiogroup">
        <button class="${mode === 'asap' ? 'on' : ''}" data-mode="asap" ${st.asap ? '' : 'disabled style="opacity:.45"'} role="radio" aria-checked="${mode === 'asap'}">Как можно скорее<br><small style="font-weight:400">${esc(shop.eta)}</small></button>
        <button class="${mode === 'slot' ? 'on' : ''}" data-mode="slot" role="radio" aria-checked="${mode === 'slot'}">Ко времени<br><small style="font-weight:400">${slot ? esc(`${days[slot.day].title.toLowerCase()}, ${slot.label}`) : 'выбрать'}</small></button>
      </div>
      ${!st.asap ? `<p class="hint" style="margin-top:10px">Сейчас мы не работаем — доставляем с ${esc(shop.hours.open)} до ${esc(shop.hours.close)}. Выберите удобное время.</p>` : ''}
      ${
        mode === 'slot' && days.length
          ? `<div class="chips" style="padding:14px 0 10px">${days
              .map((d, i) => `<button class="chip ${i === dayIdx ? 'on' : ''}" data-day="${i}">${d.title}, ${d.date}</button>`)
              .join('')}</div>
            <div class="slots">${day.slots
              .map((s, i) => `<button class="slot ${slot && slot.day === dayIdx && slot.i === i ? 'on' : ''}" data-slot="${i}">${s.label}</button>`)
              .join('')}</div>`
          : ''
      }`;
  }

  function renderPay() {
    $('[data-pay]').innerHTML = shop.payments
      .map(
        (p) => `<button class="opt ${payment === p.id ? 'on' : ''}" data-pay-id="${p.id}" role="radio" aria-checked="${payment === p.id}">
        <span class="opt__icon">${icon(p.icon || 'card')}</span>
        <span class="opt__txt"><span class="opt__title" style="display:block">${esc(p.title)}</span><span class="opt__hint">${esc(p.hint || '')}</span></span>
        <span class="radio"></span></button>`
      )
      .join('');
    $('[data-change]').hidden = payment !== 'cash';
  }

  function renderPromo() {
    const p = promo.get();
    const t = cart.totals();
    if (p) {
      const active = t.discount > 0;
      $('[data-promo]').innerHTML = `<div class="promo-ok">${icon('tag')}
        <div class="promo-ok__txt"><b>${esc(p.code)}</b>${active ? `Скидка ${money(t.discount)}` : `Действует для заказов от ${money(p.minSubtotal || 0)}`}</div>
        <button class="iconbtn" data-do="promo-remove" aria-label="Убрать промокод">${icon('x', 'i--sm')}</button></div>`;
    } else {
      $('[data-promo]').innerHTML = `<div class="field" data-f="promo"><div class="inputwrap">
        <input class="input input--upper" name="promo" placeholder="Введите промокод" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="done">
        <button type="button" class="inputwrap__btn" data-do="promo" aria-label="Применить промокод">${icon('check')}</button></div></div>`;
    }
  }

  function renderSummary() {
    const t = cart.totals();
    $('[data-items]').innerHTML = t.lines
      .map(({ p, qty }) => `<div class="co-items__it">${phHTML(p)}${qty > 1 ? `<b>${qty}</b>` : ''}</div>`)
      .join('');
    $('[data-summary]').innerHTML = summaryHTML(t, { compact: true });
    $('[data-total]').textContent = money(t.total);
  }

  function saveDraft() {
    contact.set({ name: nameIn.value.trim(), phone: phoneDigits(phoneIn.value) });
    prefs.set({ payment, door: $('[data-door]').checked, comment: commentIn.value.trim(), change: changeIn.value.trim() });
  }

  async function applyPromo() {
    const input = $('input[name="promo"]');
    const code = input.value.trim().toUpperCase();
    if (!code) return input.focus();
    const btn = $('[data-do="promo"]');
    btn.disabled = true;
    try {
      const res = await api('/api/promo', { code, subtotal: cart.totals().subtotal });
      promo.set(res.promo);
      haptic.success();
      toast(res.promo.title || 'Промокод применён', { type: 'ok' });
    } catch (err) {
      fieldError(el, 'promo', err.message || 'Промокод не найден');
      haptic.error();
    } finally {
      btn.disabled = false;
    }
  }

  function validate() {
    let first = null;
    const mark = (block) => (first = first || el.querySelector(`[data-block="${block}"]`));
    el.querySelectorAll('[data-block] .field__error').forEach((x) => x.remove());
    el.querySelectorAll('[data-block] .has-error').forEach((x) => x.classList.remove('has-error'));
    if (!addresses.current()) {
      $('.addrcard').classList.add('has-error');
      mark('addr');
    }
    if (mode === 'slot' && !slot) {
      $('[data-when]').insertAdjacentHTML('beforeend', '<div class="field__error" role="alert">Выберите время доставки</div>');
      mark('when');
    }
    if (!nameIn.value.trim()) {
      fieldError(el, 'name', 'Введите имя');
      mark('contact');
    }
    if (!phoneValid(phoneIn.value)) {
      fieldError(el, 'phone', 'Введите номер в формате +7 XXX XXX-XX-XX');
      mark('contact');
    }
    if (first) {
      haptic.error();
      const body = $('.screen__body');
      body.scrollTo({ top: first.offsetTop - 12, behavior: 'smooth' });
      return false;
    }
    return true;
  }

  async function submit() {
    if (sending) return;
    const t = cart.totals();
    if (!t.lines.length) {
      toast('Корзина пуста', { type: 'err' });
      return back();
    }
    if (!t.minOk) return toast(`Минимальная сумма заказа — ${money(shop.minOrder)}`, { type: 'err' });
    if (!validate()) return;
    saveDraft();

    const a = addresses.current();
    const day = mode === 'slot' ? days[slot.day] : null;
    const whenLabel = mode === 'asap' ? `Как можно скорее (${shop.eta})` : `${day.title}, ${day.date}, ${slot.label}`;
    const pay = shop.payments.find((p) => p.id === payment);
    const payload = {
      items: t.lines.map((l) => ({ id: l.p.id, qty: l.qty })),
      address: { ...a },
      when: mode === 'asap' ? { asap: true, label: whenLabel } : { asap: false, date: day.iso, from: day.slots[slot.i].from, to: day.slots[slot.i].to, label: whenLabel },
      contact: { name: nameIn.value.trim(), phone: phoneDigits(phoneIn.value) },
      payment: { id: payment, title: pay?.title || payment, change: payment === 'cash' ? changeIn.value.trim() : '' },
      door: $('[data-door]').checked,
      comment: commentIn.value.trim(),
      replace: prefs.get().replace,
      promo: promo.get()?.code || '',
      clientTotal: t.total,
      initData: initData(),
    };

    sending = true;
    const btn = $('[data-do="submit"]');
    btn.classList.add('is-loading');
    try {
      const res = await api('/api/order', payload);
      orders.add({
        id: res.orderId,
        at: Date.now(),
        items: t.lines.map(({ p, qty }) => ({ id: p.id, n: p.n, p: p.p, qty, w: p.w || '' })),
        subtotal: res.subtotal ?? t.subtotal,
        fee: res.fee ?? t.fee,
        discount: res.discount ?? t.discount,
        total: res.total ?? t.total,
        address: addrLine(a, { full: true }),
        when: whenLabel,
        payment: pay?.title || '',
        demo: !!res.demo,
        notified: !!res.notified,
      });
      cart.clear();
      promo.set(null);
      syncAllProducts();
      haptic.success();
      resetTo('home', `/success/${res.orderId}`);
    } catch (err) {
      haptic.error();
      if (err.data?.missing?.length) {
        err.data.missing.forEach((id) => cart.set(id, 0));
        syncAllProducts();
        renderSummary();
      }
      toast(err.message || 'Не удалось оформить заказ', { type: 'err', ms: 5000 });
    } finally {
      sending = false;
      btn.classList.remove('is-loading');
    }
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const d = t.closest('[data-do]');
    const m = t.closest('[data-mode]');
    const day = t.closest('[data-day]');
    const s = t.closest('[data-slot]');
    const pay = t.closest('[data-pay-id]');
    if (m && !m.disabled) {
      mode = m.dataset.mode;
      haptic.select();
      renderWhen();
    } else if (day) {
      dayIdx = +day.dataset.day;
      haptic.select();
      renderWhen();
    } else if (s) {
      slot = { day: dayIdx, i: +s.dataset.slot, label: days[dayIdx].slots[+s.dataset.slot].label };
      haptic.select();
      renderWhen();
    } else if (pay) {
      payment = pay.dataset.payId;
      haptic.select();
      renderPay();
      prefs.set({ payment });
    } else if (d) {
      const a = d.dataset.do;
      if (a === 'addr') openAddressPicker();
      else if (a === 'submit') submit();
      else if (a === 'promo') applyPromo();
      else if (a === 'promo-remove') {
        promo.set(null);
        renderPromo();
      } else if (a === 'tgphone') {
        const ph = await requestPhone();
        if (ph) {
          phoneIn.value = fmtPhone(ph);
          phoneIn.dispatchEvent(new Event('input'));
          contact.set({ phone: phoneDigits(ph) });
          haptic.success();
        }
      }
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.name === 'promo') {
      e.preventDefault();
      applyPromo();
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-door]')) prefs.set({ door: e.target.checked });
  });
  [nameIn, phoneIn, commentIn, changeIn].forEach((i) => i.addEventListener('blur', saveDraft));

  renderAddr();
  renderWhen();
  renderPay();
  renderPromo();
  renderSummary();
  bindScroll(el);

  const offAddr = on('addr', renderAddr);
  const offCart = on('cart', () => {
    renderSummary();
    renderPromo();
  });

  return {
    el,
    tabbar: false,
    onHide: saveDraft,
    destroy() {
      offAddr();
      offCart();
    },
  };
}
