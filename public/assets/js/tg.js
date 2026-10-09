// Обёртка над Telegram WebApp API. Вне Telegram всё деградирует мягко,
// поэтому приложение можно открыть и в обычном браузере для проверки.

const W = window.Telegram?.WebApp;

export const tg = W;
export const inTelegram = !!(W && W.initData);
export const ver = (v) => {
  try {
    return !!(inTelegram && W.isVersionAtLeast(v));
  } catch {
    return false;
  }
};
export const hasNativeBack = ver('6.1');

export function tgUser() {
  return (inTelegram && W.initDataUnsafe?.user) || null;
}

export function startParam() {
  return (inTelegram && W.initDataUnsafe?.start_param) || new URLSearchParams(location.search).get('startapp') || '';
}

export function initData() {
  return inTelegram ? W.initData : '';
}

export function prefersDark() {
  if (inTelegram) return W.colorScheme === 'dark';
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function initTelegram({ onTheme }) {
  if (inTelegram) {
    try {
      W.ready();
      W.expand();
    } catch {}
    if (ver('7.7')) {
      try {
        W.disableVerticalSwipes();
      } catch {}
    }
    W.onEvent('themeChanged', onTheme);
  } else {
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', onTheme);
  }
}

/** Красим шапку и фон Telegram в цвет приложения */
export function paintChrome(bg) {
  if (!inTelegram) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
    return;
  }
  try {
    if (ver('6.9')) {
      W.setHeaderColor(bg);
      W.setBackgroundColor(bg);
    } else if (ver('6.1')) {
      W.setHeaderColor('bg_color');
    }
    if (ver('7.10')) W.setBottomBarColor(bg);
  } catch {}
}

export const haptic = {
  light: () => ver('6.1') && W.HapticFeedback.impactOccurred('light'),
  medium: () => ver('6.1') && W.HapticFeedback.impactOccurred('medium'),
  select: () => ver('6.1') && W.HapticFeedback.selectionChanged(),
  success: () => ver('6.1') && W.HapticFeedback.notificationOccurred('success'),
  warning: () => ver('6.1') && W.HapticFeedback.notificationOccurred('warning'),
  error: () => ver('6.1') && W.HapticFeedback.notificationOccurred('error'),
};

let backHandler = null;
export function bindBackButton(handler) {
  backHandler = handler;
  if (hasNativeBack) W.BackButton.onClick(() => backHandler?.());
}
export function showBack(visible) {
  if (!hasNativeBack) return;
  visible ? W.BackButton.show() : W.BackButton.hide();
}

/** CloudStorage Telegram: синхронизация корзины/адресов между устройствами */
const cloudOk = ver('6.9') && !!W.CloudStorage;
function withTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}
export const cloud = {
  ok: cloudOk,
  getMany(keys) {
    if (!cloudOk) return Promise.resolve({});
    return withTimeout(
      new Promise((res) => {
        try {
          W.CloudStorage.getItems(keys, (err, values) => res(err ? {} : values || {}));
        } catch {
          res({});
        }
      }),
      2500,
      {}
    );
  },
  set(key, value) {
    if (!cloudOk) return Promise.resolve(false);
    return withTimeout(
      new Promise((res) => {
        try {
          W.CloudStorage.setItem(key, value, (err) => res(!err));
        } catch {
          res(false);
        }
      }),
      2500,
      false
    );
  },
};

/** Подтверждение: нативное в Telegram, иначе null (ui.js покажет свой диалог) */
export function nativeConfirm({ title, text, ok, danger }) {
  if (!ver('6.2')) return null;
  return new Promise((resolve) => {
    try {
      W.showPopup(
        {
          title: (title || '').slice(0, 64),
          message: (text || title || '').slice(0, 256),
          buttons: [
            { id: 'ok', type: danger ? 'destructive' : 'default', text: ok || 'OK' },
            { id: 'cancel', type: 'cancel' },
          ],
        },
        (id) => resolve(id === 'ok')
      );
    } catch {
      resolve(window.confirm(text || title));
    }
  });
}

/** Телефон из Telegram (пользователь подтверждает в нативном окне) */
export function requestPhone() {
  if (!ver('6.9')) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      W.requestContact((shared, resp) => {
        const phone = shared && resp?.responseUnsafe?.contact?.phone_number;
        resolve(phone || null);
      });
    } catch {
      resolve(null);
    }
  });
}
export const canRequestPhone = ver('6.9');

export function canWriteToUser() {
  const u = tgUser();
  return !!(u && u.allows_write_to_pm);
}
export function requestWriteAccess() {
  if (!ver('6.9')) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      W.requestWriteAccess((ok) => resolve(!!ok));
    } catch {
      resolve(false);
    }
  });
}

export function openLink(url) {
  if (!url) return;
  if (inTelegram && /^https:\/\/t\.me\//.test(url)) W.openTelegramLink(url);
  else if (inTelegram) W.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/** Геопозиция: LocationManager Telegram (8.0+) или браузерная */
export function getLocation() {
  return new Promise((resolve) => {
    const browser = () => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    };
    if (ver('8.0') && W.LocationManager) {
      try {
        const LM = W.LocationManager;
        const ask = () => {
          if (!LM.isLocationAvailable) return browser();
          LM.getLocation((d) => {
            if (d) resolve({ lat: d.latitude, lon: d.longitude, acc: d.horizontal_accuracy });
            else if (LM.isAccessRequested && !LM.isAccessGranted) resolve({ denied: true });
            else resolve(null);
          });
        };
        LM.isInited ? ask() : LM.init(ask);
        return;
      } catch {
        /* упадём в браузерный вариант */
      }
    }
    browser();
  });
}

export function openLocationSettings() {
  try {
    if (ver('8.0')) W.LocationManager.openSettings();
  } catch {}
}
