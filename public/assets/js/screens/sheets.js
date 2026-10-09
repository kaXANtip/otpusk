// Шторки: выбор и редактирование адреса, контакты, условия доставки

import { esc, icon, money, uid, fmtPhone, phoneValid, phoneDigits } from '../util.js';
import { shop, freeFrom } from '../data.js';
import { addresses, contact, addrDetails } from '../store.js';
import { openSheet, toast, confirmDialog } from '../ui.js';
import { haptic, getLocation, canRequestPhone, requestPhone, openLocationSettings } from '../tg.js';

// ---------------------------------------------------------------- адреса
export function openAddressPicker({ onDone } = {}) {
  if (!addresses.list().length) return openAddressEditor(null, { onDone });
  const render = () => {
    const cur = addresses.current();
    return `<div class="opts">${addresses
      .list()
      .map(
        (a) => `<div class="opt ${cur?.id === a.id ? 'on' : ''}" style="padding-right:4px">
          <button style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;text-align:left;padding:4px 0" data-pick="${a.id}">
            <span class="radio"></span>
            <span class="opt__txt"><span class="opt__title">${esc(a.street)}</span>
            <span class="opt__hint" style="display:block">${esc([a.label, addrDetails(a)].filter(Boolean).join(' · '))}</span></span>
          </button>
          <button class="iconbtn" data-edit="${a.id}" aria-label="Изменить адрес">${icon('edit', 'i--sm')}</button>
        </div>`
      )
      .join('')}</div>`;
  };
  const sheet = openSheet({
    title: 'Куда доставить?',
    body: render(),
    foot: `<button class="btn btn--soft" data-new>${icon('plus')}Добавить адрес</button>`,
  });
  sheet.el.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    const edit = e.target.closest('[data-edit]');
    if (pick) {
      haptic.select();
      addresses.select(pick.dataset.pick);
      sheet.close();
      onDone?.();
    } else if (edit) {
      sheet.close();
      openAddressEditor(addresses.list().find((a) => a.id === edit.dataset.edit), { onDone });
    } else if (e.target.closest('[data-new]')) {
      sheet.close();
      openAddressEditor(null, { onDone });
    }
  });
}

export function openAddressEditor(addr, { onDone } = {}) {
  const cities = shop.cities?.length ? shop.cities : [''];
  const a = addr ? { ...addr } : { id: uid(), city: cities[0], street: '', house: false, label: 'Дом' };
  const labels = ['Дом', 'Работа', 'Другое'];
  const body = `<form class="form" novalidate autocomplete="on">
    ${
      cities.length > 1
        ? `<div class="field"><span class="field__label">Населённый пункт</span><div class="chips" style="padding:0;flex-wrap:wrap">${cities
            .map((c) => `<button type="button" class="chip ${a.city === c ? 'on' : ''}" data-city="${esc(c)}">${esc(c)}</button>`)
            .join('')}</div></div>`
        : `<div class="hint" style="display:flex;gap:8px;align-items:center">${icon('pin', 'i--sm')}Доставляем по городу ${esc(cities[0])}</div>`
    }
    <label class="field" data-f="street"><span class="field__label">Улица и дом <b>*</b></span>
      <input class="input" name="street" value="${esc(a.street)}" placeholder="ул. Киевская, 10" autocomplete="street-address" enterkeyhint="next" required></label>
    <div class="row" style="border:0;min-height:44px;padding:0">
      <div class="row__txt"><div class="row__title">Частный дом</div></div>
      <label class="switch"><input type="checkbox" name="house" ${a.house ? 'checked' : ''} aria-label="Частный дом"><span></span></label>
    </div>
    <div class="grid2" data-flat ${a.house ? 'hidden' : ''}>
      <label class="field"><span class="field__label">Квартира / офис</span><input class="input" name="flat" value="${esc(a.flat || '')}" inputmode="numeric" enterkeyhint="next"></label>
      <label class="field"><span class="field__label">Подъезд</span><input class="input" name="entrance" value="${esc(a.entrance || '')}" inputmode="numeric" enterkeyhint="next"></label>
      <label class="field"><span class="field__label">Этаж</span><input class="input" name="floor" value="${esc(a.floor || '')}" inputmode="numeric" enterkeyhint="next"></label>
      <label class="field"><span class="field__label">Домофон</span><input class="input" name="intercom" value="${esc(a.intercom || '')}" enterkeyhint="next"></label>
    </div>
    <label class="field"><span class="field__label">Комментарий для курьера</span>
      <textarea class="input" name="comment" rows="2" placeholder="Например: вход со двора, синяя калитка">${esc(a.comment || '')}</textarea></label>
    <button type="button" class="opt" data-geo style="border-style:dashed">
      <span class="opt__icon">${icon('locate')}</span>
      <span class="opt__txt"><span class="opt__title" data-geo-title>${a.lat ? 'Геопозиция добавлена' : 'Отметить, где я'}</span>
      <span class="opt__hint" data-geo-hint>${a.lat ? 'Курьер увидит точку на карте' : 'Поможет курьеру быстрее найти вас'}</span></span>
      ${a.lat ? icon('check') : ''}
    </button>
    <div class="field"><span class="field__label">Как назвать адрес</span>
      <div class="seg" role="radiogroup">${labels.map((l) => `<button type="button" class="${a.label === l ? 'on' : ''}" data-label="${l}" role="radio" aria-checked="${a.label === l}">${l}</button>`).join('')}</div></div>
  </form>`;
  const foot = `<div class="btnrow">${addr ? `<button class="btn btn--ghost" data-del style="flex:0 0 54px;padding:0" aria-label="Удалить адрес">${icon('trash')}</button>` : ''}
    <button class="btn btn--primary" data-save>Сохранить адрес</button></div>`;
  const sheet = openSheet({ title: addr ? 'Изменить адрес' : 'Новый адрес', body, foot });
  const form = sheet.el.querySelector('form');

  form.house.addEventListener('change', () => {
    sheet.el.querySelector('[data-flat]').hidden = form.house.checked;
  });
  form.street.addEventListener('input', () => sheet.el.querySelector('[data-f="street"]').classList.remove('has-error'));

  sheet.el.addEventListener('click', async (e) => {
    const city = e.target.closest('[data-city]');
    const label = e.target.closest('[data-label]');
    if (city) {
      a.city = city.dataset.city;
      sheet.el.querySelectorAll('[data-city]').forEach((b) => b.classList.toggle('on', b === city));
    } else if (label) {
      a.label = label.dataset.label;
      sheet.el.querySelectorAll('[data-label]').forEach((b) => {
        b.classList.toggle('on', b === label);
        b.setAttribute('aria-checked', String(b === label));
      });
      haptic.select();
    } else if (e.target.closest('[data-geo]')) {
      const t = sheet.el.querySelector('[data-geo-title]');
      const h = sheet.el.querySelector('[data-geo-hint]');
      t.textContent = 'Определяем…';
      const loc = await getLocation();
      if (loc && loc.lat) {
        a.lat = +loc.lat.toFixed(6);
        a.lon = +loc.lon.toFixed(6);
        t.textContent = 'Геопозиция добавлена';
        h.textContent = loc.acc ? `Точность ~${Math.round(loc.acc)} м` : 'Курьер увидит точку на карте';
        haptic.success();
      } else {
        t.textContent = 'Не удалось определить';
        h.textContent = loc?.denied ? 'Разрешите доступ к геопозиции в настройках' : 'Можно указать только адрес — этого достаточно';
        if (loc?.denied) openLocationSettings();
        haptic.warning();
      }
    } else if (e.target.closest('[data-save]')) {
      const street = form.street.value.trim();
      if (street.length < 3 || !/\d/.test(street)) {
        const f = sheet.el.querySelector('[data-f="street"]');
        f.classList.add('has-error');
        if (!f.querySelector('.field__error')) f.insertAdjacentHTML('beforeend', '<div class="field__error" role="alert">Укажите улицу и номер дома</div>');
        form.street.focus();
        haptic.error();
        return;
      }
      Object.assign(a, {
        street,
        house: form.house.checked,
        flat: form.flat.value.trim(),
        entrance: form.entrance.value.trim(),
        floor: form.floor.value.trim(),
        intercom: form.intercom.value.trim(),
        comment: form.comment.value.trim(),
      });
      addresses.save(a);
      haptic.success();
      sheet.close();
      onDone?.();
    } else if (e.target.closest('[data-del]')) {
      if (await confirmDialog({ title: 'Удалить адрес?', text: a.street, ok: 'Удалить', danger: true })) {
        addresses.remove(a.id);
        sheet.close();
        onDone?.();
      }
    }
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  if (!addr) setTimeout(() => form.street.focus(), 350);
}

// ---------------------------------------------------------------- контакты
export function openContactEditor({ onDone } = {}) {
  const c = contact.get();
  const body = `<form class="form" novalidate>
    <label class="field" data-f="name"><span class="field__label">Имя <b>*</b></span>
      <input class="input" name="name" value="${esc(c.name)}" autocomplete="given-name" placeholder="Как к вам обращаться"></label>
    <label class="field" data-f="phone"><span class="field__label">Телефон <b>*</b></span>
      <span class="inputwrap"><input class="input num" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(fmtPhone(c.phone))}" placeholder="+7 (978) 000-00-00">
      ${canRequestPhone ? `<button type="button" class="inputwrap__btn" data-tgphone aria-label="Номер из Telegram">${icon('phone')}</button>` : ''}</span>
      <span class="field__help">Курьер позвонит, если не сможет найти вас</span></label>
  </form>`;
  const sheet = openSheet({ title: 'Контактные данные', body, foot: `<button class="btn btn--primary" data-save>Сохранить</button>` });
  const form = sheet.el.querySelector('form');
  bindPhoneInput(form.phone);
  sheet.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-tgphone]')) {
      const ph = await requestPhone();
      if (ph) {
        form.phone.value = fmtPhone(ph);
        haptic.success();
      }
    } else if (e.target.closest('[data-save]')) {
      const name = form.name.value.trim();
      const phone = phoneDigits(form.phone.value);
      let bad = false;
      sheet.el.querySelectorAll('.field__error').forEach((x) => x.remove());
      if (!name) bad = fieldError(sheet.el, 'name', 'Введите имя');
      if (!phoneValid(phone)) bad = fieldError(sheet.el, 'phone', 'Номер должен быть в формате +7 XXX XXX-XX-XX') || true;
      if (bad) return haptic.error();
      contact.set({ name, phone });
      haptic.success();
      toast('Контакты сохранены', { type: 'ok' });
      sheet.close();
      onDone?.();
    }
  });
}

export function fieldError(root, name, text) {
  const f = root.querySelector(`[data-f="${name}"]`);
  if (!f) return true;
  f.classList.add('has-error');
  f.querySelector('.field__error')?.remove();
  f.insertAdjacentHTML('beforeend', `<div class="field__error" role="alert">${esc(text)}</div>`);
  const clear = () => {
    f.classList.remove('has-error');
    f.querySelector('.field__error')?.remove();
  };
  f.querySelector('input, textarea')?.addEventListener('input', clear, { once: true });
  return true;
}

/** Маска телефона +7 (XXX) XXX-XX-XX */
export function bindPhoneInput(input) {
  input.addEventListener('input', () => {
    const atEnd = input.selectionStart === input.value.length;
    const formatted = fmtPhone(input.value);
    if (formatted !== input.value) {
      input.value = formatted;
      if (atEnd) input.setSelectionRange(formatted.length, formatted.length);
    }
  });
  input.addEventListener('focus', () => {
    if (!input.value) input.value = '+7 (';
  });
  input.addEventListener('blur', () => {
    if (phoneDigits(input.value).length <= 1) input.value = '';
  });
}

// ---------------------------------------------------------------- условия доставки
export function openDeliveryInfo() {
  const tiers = [...shop.delivery].sort((a, b) => a.from - b.from);
  const free = freeFrom();
  const rows = tiers
    .map((t, i) => {
      const to = tiers[i + 1]?.from;
      const range = to ? `от ${money(t.from)} до ${money(to)}` : `от ${money(t.from)}`;
      return `<div class="pd__fact"><span>Заказ ${range.replace('от 0 ₽ до', 'до')}</span><span>${t.fee ? money(t.fee) : 'бесплатно'}</span></div>`;
    })
    .join('');
  const body = `
    <div class="infocard" style="margin:0">
      <div class="inforow">${icon('clock')}<div><b>Ежедневно с ${esc(shop.hours.open)} до ${esc(shop.hours.close)}</b><br><span class="muted">Привозим за ${esc(shop.eta)} или ко времени</span></div></div>
      <div class="inforow">${icon('pin')}<div><b>${esc((shop.cities || []).join(', '))}</b><br><span class="muted">Зона доставки</span></div></div>
      <div class="inforow">${icon('bag')}<div><b>Минимальный заказ — ${money(shop.minOrder)}</b>${free != null ? `<br><span class="muted">Доставка бесплатно от ${money(free)}</span>` : ''}</div></div>
    </div>
    <h3 class="h2">Стоимость доставки</h3>
    <div class="pd__facts" style="margin:0">${rows}</div>
    <h3 class="h2">Оплата</h3>
    <div class="opts">${shop.payments
      .map((p) => `<div class="opt" style="cursor:default"><span class="opt__icon">${icon(p.icon || 'card')}</span><span class="opt__txt"><span class="opt__title">${esc(p.title)}</span><span class="opt__hint" style="display:block">${esc(p.hint || '')}</span></span></div>`)
      .join('')}</div>
    <h3 class="h2">Если чего-то не окажется</h3>
    <p class="muted" style="font-size:14px">Мы позвоним и предложим замену или уберём товар из заказа — как вы выберете в корзине. Сумма пересчитается, платить за то, чего нет, не придётся.</p>`;
  openSheet({ title: 'Условия доставки', body, foot: null });
}
