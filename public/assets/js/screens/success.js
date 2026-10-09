// «Заказ оформлен»

import { esc, icon, money } from '../util.js';
import { orders } from '../store.js';
import { screenEl } from '../ui.js';
import { inTelegram, canWriteToUser, requestWriteAccess, haptic } from '../tg.js';

export default function success(params) {
  const el = screenEl();
  const o = orders.get(params.id);
  const askWrite = inTelegram && !canWriteToUser();
  el.innerHTML = `<div class="screen__body" style="padding-bottom:calc(var(--safe-bottom) + 24px)">
    <div class="success">
      <div class="success__check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Заказ принят!</h1>
      <p>${o ? `Номер заказа <b>№${esc(o.id)}</b>. ` : ''}Мы уже начали собирать продукты. ${inTelegram ? 'Статус пришлём сообщением в этот чат.' : 'Оператор свяжется с вами для подтверждения.'}</p>
      ${
        o
          ? `<div class="success__card">
        <div class="group">
          <div class="row"><span class="row__icon">${icon('clock')}</span><div class="row__txt"><div class="row__sub">Когда</div><div class="row__title">${esc(o.when)}</div></div></div>
          <div class="row"><span class="row__icon">${icon('pin')}</span><div class="row__txt"><div class="row__sub">Куда</div><div class="row__title" style="white-space:normal">${esc(o.address)}</div></div></div>
          <div class="row"><span class="row__icon">${icon('card')}</span><div class="row__txt"><div class="row__sub">Оплата при получении</div><div class="row__title">${esc(o.payment)} · ${money(o.total)}</div></div></div>
        </div>
        ${o.demo ? `<div class="notice">${icon('info')}<div><b>Тестовый режим.</b> Сервер ещё не подключён к Telegram-боту, поэтому заказ не ушёл оператору. Добавьте BOT_TOKEN и ADMIN_CHAT_ID в настройках Vercel — см. README.</div></div>` : ''}
        ${askWrite ? `<button class="btn btn--soft" data-do="write" style="margin-top:12px">${icon('chat')}Получать статус заказа в Telegram</button>` : ''}
      </div>`
          : ''
      }
    </div>
    <div class="pad" style="display:grid;gap:10px;margin-top:24px">
      <button class="btn btn--primary" data-act="tab" data-to="home">Продолжить покупки</button>
      <button class="btn btn--ghost" data-act="go" data-to="/orders">Мои заказы</button>
    </div>
  </div>`;

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do="write"]');
    if (!b) return;
    const ok = await requestWriteAccess();
    if (ok) {
      haptic.success();
      b.outerHTML = `<div class="notice" style="background:var(--primary-tint)">${icon('check')}<div>Готово! Бот напишет, когда заказ будет в пути.</div></div>`;
    }
  });

  return { el, tabbar: false };
}
