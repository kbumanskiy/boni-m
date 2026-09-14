// Анонимная статистика использования (решение Кости, 14 сентября 2026).
//
// Наружу уходит ровно четыре вещи: случайный номер установки, версия приложения,
// сколько минут длилось занятие и дата. Ни имени, ни позывного, ни прогресса,
// ни настроек. Отдельный ключ localStorage: статистика не должна трогать
// boni_m_state с его миграцией и резервной копией.
//
// Занятие без сети работает как раньше: событие лежит в очереди и уходит, когда
// сеть появится. Сервер недоступен — приложение этого не замечает.

export const METRICS_KEY = 'boni_m_metrics';
export const QUEUE_MAX = 50;   // больше — значит человек месяцами офлайн; старое не нужно
export const MIN_MAX = 600;    // занятие дольше десяти часов — это забытый телефон, а не занятие

const randomBytes = (n) => {
  const b = new Uint8Array(n);
  try { if (globalThis.crypto && crypto.getRandomValues) { crypto.getRandomValues(b); return b; } } catch {}
  for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
};

export function newHex(bytes, source = randomBytes) {
  return Array.from(source(bytes), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function emptyMeta() {
  return { id: '', queue: [] };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function loadMeta(storage) {
  const store = getStorage(storage);
  if (!store) return emptyMeta();
  try {
    const raw = JSON.parse(store.getItem(METRICS_KEY) || 'null');
    if (!isObj(raw)) return emptyMeta();
    return {
      id: typeof raw.id === 'string' && /^[0-9a-f]{16}$/.test(raw.id) ? raw.id : '',
      queue: Array.isArray(raw.queue) ? raw.queue.filter(isObj).slice(-QUEUE_MAX) : [],
    };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta, storage) {
  const store = getStorage(storage);
  if (!store) return false;
  try { store.setItem(METRICS_KEY, JSON.stringify(meta)); return true; } catch { return false; }
}

export function ensureId(meta) {
  return meta.id ? meta : { ...meta, id: newHex(8) };
}

// Одно занятие: от открытия до сворачивания. Ключ k нужен серверу, чтобы склеить
// повтор: ответ мог не дойти, и событие уйдёт ещё раз при следующем открытии.
export function sessionEvent({ start, end, version, day }) {
  const ms = Number(end) - Number(start);
  const min = Number.isFinite(ms) && ms > 0 ? Math.min(MIN_MAX, Math.round(ms / 60000)) : 0;
  return { k: newHex(4), v: String(version || '').slice(0, 20), min, day: String(day || '').slice(0, 10) };
}

export function enqueue(meta, event) {
  return { ...meta, queue: [...meta.queue, event].slice(-QUEUE_MAX) };
}

export function buildPayload(meta) {
  if (!meta.id || !meta.queue.length) return null;
  return { id: meta.id, from: 'app', events: meta.queue.slice() };
}

export function dropSent(meta, sentKeys) {
  const gone = new Set(sentKeys);
  return { ...meta, queue: meta.queue.filter((e) => !gone.has(e.k)) };
}

export function metricsOn(settings) {
  return !settings || settings.metrics !== false;
}

// Сегодняшняя дата по часам телефона — для сводки нужен день, а не момент.
export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
