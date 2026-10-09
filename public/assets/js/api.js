// Запросы к серверным функциям Vercel (/api/*)

export async function api(path, body, { timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    const err = new Error(e.name === 'AbortError' ? 'Сервер долго не отвечает. Попробуйте ещё раз' : 'Нет соединения с интернетом. Проверьте сеть и попробуйте снова');
    err.network = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data || !data.ok) {
    const err = new Error(data?.error || (res.status === 404 ? 'Сервер заказов недоступен' : `Ошибка сервера (${res.status}). Попробуйте ещё раз`));
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}
