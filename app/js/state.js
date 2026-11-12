// Состояние и сохранность (ТЗ §2, §13). Ключ localStorage — boni_m_state.
// Всё чтение/запись в try/catch; битый/отсутствующий state → дефолт; квота → работаем в памяти.
import { clampEff, LIMITS } from './timing.js';
import { puzzleFresh, puzzleClean } from './puzzle.js';

export const STORAGE_KEY = 'boni_m_state';
export const STATE_VERSION = 2;

export function defaultState() {
  return {
    version: STATE_VERSION,
    // Позывной по умолчанию пустой: подставлять сюда чужой (а «Boney M» — позывной папы)
    // значит показывать его каждому, кто поставит приложение, и проигрывать в упражнении.
    profile: { name: '', callsign: '', points: 0 },
    progress: {
      // lastFirst — знак, с которого началось прошлое занятие (чтобы не начинать с него снова).
      ru: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [], lastFirst: null },
      en: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [], lastFirst: null },
    },
    settings: {
      alphabet: 'ru', charWpm: 18, effWpm: 9, keyWpm: 12,
      toneHz: 600, volume: 0.5, showChants: true, vibration: true,
      // Короткий отклик после ответа («верно» / «мимо»). Радиолюбителю с форума он мешает:
      // «очень раздражает звук подтверждения, достаточно того, что символ подсвечивается».
      // По умолчанию включён: у папы приложение уже так звучит, и менять это молча нельзя.
      answerSound: true,
      keyMode: 'train', // режим «Ключа»: 'train' (с подсказкой) | 'free' (свободный набор)
      // Контрольная радиограмма: своя скорость (её крутят отдельно от учебной),
      // вид текста и длительность захода.
      radiogramCpm: 60, radiogramKind: 'letters', radiogramFull: false,
      // «Длинная» — тренировка с фиксированным числом групп, не по правилам соревнований.
      // radiogramFull при её выборе не трогается, чтобы откат на v25 видел прежний выбор
      // «Короткая»/«Минута». Список допустимых чисел — LIMITS.radiogramGroups (timing.js).
      radiogramLong: false, radiogramGroups: 30,
      theme: 'auto',    // оформление: 'auto' (как в телефоне) | 'light' | 'dark'
      // Анонимная статистика (минуты занятия и номер установки, см. js/metrics.js).
      // Включена по умолчанию, выключается одним касанием в настройках.
      metrics: true,
      // «Я уже знаю азбуку» (настройки): открывает контрольную радиограмму сразу
      // и со всеми знаками курса. Прогресс обучения (освоено, звание, вехи) не трогает.
      knowsAll: false,
      // Длина тире в точках: 3 («как в эфире») / 3,5 / 4. Только для учёбы — радиограмма
      // всегда 3 (звук получает её через dahUnits от withDah в app.js, ТЗ-длина-тире.md).
      dahRatio: 3,
    },
    streak: { current: 0, longest: 0, lastActiveDate: null },
    // Личные рекорды. Пока один: самая быстрая ПРИНЯТАЯ контрольная радиограмма —
    // единственная величина, которую радист сравнивает с разрядными нормами.
    records: { radiogramCpm: 0 },
    totalSeconds: 0,
    history: [],
    milestones: {},
    // Радиоигра (js/puzzle.js): колода на каждую категорию { seen, last, solved } —
    // seen/last — текущий круг, solved — разгадано когда-либо; isNew — пометка «Новое»
    // на плитке для тех, кто пользовался приложением до появления режима.
    puzzle: puzzleFresh(),
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const clampNum = (v, lo, hi, d) => Math.min(hi, Math.max(lo, num(v, d)));

// Строка длиной 1–3 кодовые точки. Каждый знак курса сейчас — один символ, три — запас
// (ТЗ-переезд.md, 3.3). Белого списка по DATA нет: знак, убранный из курса, не должен тихо
// терять статистику.
const shortKey = (k) => typeof k === 'string' && [...k].length >= 1 && [...k].length <= 3;
const PERCHAR_MAX = 200;

// perChar приходит и из чужого файла (копия, перенос): оставляем только пары вида
// { correct, total } с целыми 0 ≤ correct ≤ total. Порядок ключей сохраняется.
function cleanPerChar(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= PERCHAR_MAX) break;
    if (!shortKey(k) || !isObj(v)) continue;
    if (!Number.isInteger(v.correct) || !Number.isInteger(v.total) || v.correct < 0 || v.total < 0) continue;
    out[k] = { correct: Math.min(v.correct, v.total), total: v.total };
    n++;
  }
  return out;
}

// Отложенный знак — объект { char, returnAt } (progress.js), а не строка.
function cleanParked(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => isObj(p) && shortKey(p.char) && Number.isInteger(p.returnAt) && p.returnAt >= 0)
    .slice(0, 2) // одновременно не более двух (§6.1)
    .map((p) => ({ char: p.char, returnAt: p.returnAt }));
}

function sanitizeTrack(raw, def) {
  const t = isObj(raw) ? raw : {};
  return {
    learnedCount: Math.max(0, Math.floor(num(t.learnedCount, def.learnedCount))),
    digitsLearned: Math.max(0, Math.floor(num(t.digitsLearned, def.digitsLearned))),
    perChar: cleanPerChar(t.perChar),
    recent: Array.isArray(t.recent) ? t.recent.slice(-30).map((v) => (v === 1 || v === true ? 1 : 0)) : [],
    parked: cleanParked(t.parked),
    lastFirst: typeof t.lastFirst === 'string' && t.lastFirst ? t.lastFirst : null,
  };
}

// Мягкая миграция: привести любой raw к актуальной схеме, НЕ теряя накопленный прогресс (§2).
export function migrate(raw) {
  const def = defaultState();
  if (!isObj(raw)) return def;

  const s = defaultState();
  // Профиль
  if (isObj(raw.profile)) {
    s.profile.name = typeof raw.profile.name === 'string' ? raw.profile.name : '';
    // Уже записанный позывной не трогаем ни в коем случае: на телефоне папы лежит
    // «Boney M», и упражнение должно звучать ровно так, как он привык.
    s.profile.callsign = typeof raw.profile.callsign === 'string' ? raw.profile.callsign : '';
    s.profile.points = Math.max(0, Math.floor(num(raw.profile.points, 0)));
  }
  // Прогресс — раздельно по алфавитам
  if (isObj(raw.progress)) {
    s.progress.ru = sanitizeTrack(raw.progress.ru, def.progress.ru);
    s.progress.en = sanitizeTrack(raw.progress.en, def.progress.en);
  }
  // Настройки (с зажимом диапазонов и инвариантом E <= C)
  if (isObj(raw.settings)) {
    const r = raw.settings;
    s.settings.alphabet = r.alphabet === 'en' ? 'en' : 'ru';
    // Границы берём из timing.js — те же самые, что предлагает экран настроек.
    // Своих чисел здесь быть не должно: разойдутся — настройка перестанет доживать
    // до следующего запуска, а человек этого даже не заметит.
    s.settings.charWpm = clampNum(r.charWpm, LIMITS.charWpm.min, LIMITS.charWpm.max, 18);
    s.settings.effWpm = clampEff(
      clampNum(r.effWpm, LIMITS.effWpm.min, LIMITS.effWpm.max, 9), s.settings.charWpm);
    s.settings.keyWpm = clampNum(r.keyWpm, LIMITS.keyWpm.min, LIMITS.keyWpm.max, 12);
    s.settings.toneHz = clampNum(r.toneHz, LIMITS.toneHz.min, LIMITS.toneHz.max, 600);
    s.settings.volume = clampNum(r.volume, LIMITS.volume.min, LIMITS.volume.max, 0.5);
    s.settings.showChants = r.showChants !== false;
    s.settings.answerSound = r.answerSound !== false;
    s.settings.vibration = r.vibration !== false;
    s.settings.keyMode = r.keyMode === 'free' ? 'free' : 'train';
    s.settings.radiogramCpm = clampNum(r.radiogramCpm, LIMITS.radiogramCpm.min, LIMITS.radiogramCpm.max, 60);
    s.settings.radiogramKind = ['letters', 'digits', 'mixed'].includes(r.radiogramKind) ? r.radiogramKind : 'letters';
    s.settings.radiogramFull = r.radiogramFull === true;
    s.settings.radiogramLong = r.radiogramLong === true;
    // Белый список, без зажима в диапазон: 37 из подсунутого файла копии станет 30.
    // ?. — на случай смешанного кэша при обновлении: новый state.js со старым timing.js,
    // где radiogramGroups ещё нет. Исключение здесь превратилось бы в пустое состояние.
    s.settings.radiogramGroups = LIMITS.radiogramGroups?.options?.includes(r.radiogramGroups)
      ? r.radiogramGroups : (LIMITS.radiogramGroups?.def ?? 30);
    s.settings.theme = ['light', 'dark'].includes(r.theme) ? r.theme : 'auto';
    s.settings.metrics = r.metrics !== false;
    s.settings.knowsAll = r.knowsAll === true;
    // Белый список ступеней; хранится число, а не номер ступени. ?. — смешанный кэш
    // (новый state.js со старым timing.js): исключение здесь стёрло бы прогресс.
    s.settings.dahRatio = LIMITS.dahRatio?.steps?.includes(r.dahRatio)
      ? r.dahRatio : (LIMITS.dahRatio?.def ?? 3);
  }
  if (isObj(raw.records)) {
    s.records.radiogramCpm = clampNum(raw.records.radiogramCpm, 0, LIMITS.radiogramCpm.max, 0);
  }
  // Серия дней
  if (isObj(raw.streak)) {
    s.streak.current = Math.max(0, Math.floor(num(raw.streak.current, 0)));
    s.streak.longest = Math.max(0, Math.floor(num(raw.streak.longest, 0)));
    s.streak.lastActiveDate = typeof raw.streak.lastActiveDate === 'string'
      ? raw.streak.lastActiveDate : null;
  }
  s.totalSeconds = Math.max(0, num(raw.totalSeconds, 0));
  // Записи журнала приводим к типам поштучно. Раньше массив копировался как есть, а экран
  // «Журнал» выводит число ответов и точность БЕЗ экранирования. Файл резервной копии
  // приходит извне («Восстановить из копии»), то есть подсунутый файл мог протащить
  // произвольную разметку в приложение и остаться там навсегда.
  s.history = (Array.isArray(raw.history) ? raw.history : [])
    .filter(isObj)
    .slice(-30)
    .map((h) => ({
      date: typeof h.date === 'string' ? h.date.slice(0, 10) : '',
      answers: Math.max(0, Math.floor(num(h.answers, 0))),
      accuracyPct: clampNum(h.accuracyPct, 0, 100, 0),
    }));
  // Вехи — только известные ключи со значением «да/нет»: чужой файл не должен заводить
  // в состоянии посторонние поля.
  s.milestones = {};
  if (isObj(raw.milestones)) {
    for (const [k, v] of Object.entries(raw.milestones)) {
      if (/^[a-zA-Z0-9]{1,20}$/.test(k) && v === true) s.milestones[k] = true;
    }
  }
  // Радиоигра: только id из каталога, без повторов (белый список живёт в puzzle.js).
  // isNew считается по СЫРОМУ входу: прогресс есть, а поля puzzle нет — значит, человек
  // пользовался приложением до появления режима, и плитке положена пометка «Новое».
  // Чистая установка сюда не попадает вовсе (пустое хранилище → defaultState, isNew:false).
  // Восстановление из копии, сделанной до обновления, вернёт пометку — это безобидно.
  const oldUser = isObj(raw.progress) && raw.puzzle === undefined;
  s.puzzle = puzzleClean(raw.puzzle, oldUser || (isObj(raw.puzzle) && raw.puzzle.isNew === true));
  s.version = STATE_VERSION;
  return s;
}

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

// ——— Нечитаемая запись не затирается молча (ТЗ-длинные-радиограммы.md, 7.3) ———
// Если сохранённое состояние не читается (битый JSON, ошибка миграции, смешанный кэш при
// обновлении), load отдаёт пустое состояние, а следующее сохранение перезаписало бы
// исходник — прогресс пропал бы без следа. Поэтому сырую строку сначала кладём в свой
// слот boni_m_state_broken_<дата>_<хэш>, до трёх слотов (самые старые удаляются).
// Порядок слотов — в отдельном списке: ключи одного дня по имени по времени не сортируются.
// Основной ключ перезаписывать можно, только если копия подтверждена (записана и прочитана
// обратно или уже лежала). Не записалась физически — в этом сеансе основной ключ не трогаем,
// а экран настроек об этом говорит (saveBlocked).
const BROKEN_PREFIX = STORAGE_KEY + '_broken_';
const BROKEN_LIST = STORAGE_KEY + '_brokenlist';
const BROKEN_MAX = 3;
const blocked = new WeakSet(); // хранилища, в которые в этом сеансе писать нельзя

function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function hash4(str) {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, 4);
}

// Сохранить нечитаемую строку в аварийный слот. true — копия подтверждена.
function keepBroken(store, raw) {
  try {
    let list;
    try { list = JSON.parse(store.getItem(BROKEN_LIST) || '[]'); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter((k) => typeof k === 'string' && k.startsWith(BROKEN_PREFIX) && store.getItem(k) !== null);
    // Та же строка уже лежит — новый слот не нужен.
    if (list.some((k) => store.getItem(k) === raw)) return true;
    // Короткий хэш может совпасть у разных строк — тогда свободный ключ с суффиксом,
    // чтобы новая копия не затёрла чужую.
    const base = `${BROKEN_PREFIX}${localDay()}_${hash4(raw)}`;
    let key = base;
    for (let n = 2; store.getItem(key) !== null && store.getItem(key) !== raw; n++) key = `${base}_${n}`;
    if (store.getItem(key) === raw) return true;
    list = list.filter((k) => k !== key);
    while (list.length > BROKEN_MAX - 1) {
      const old = list.shift();
      try { store.removeItem(old); } catch {}
    }
    store.setItem(key, raw);
    if (store.getItem(key) !== raw) return false;
    list.push(key);
    try { store.setItem(BROKEN_LIST, JSON.stringify(list)); } catch {}
    return true;
  } catch {
    return false;
  }
}

// Запрещена ли в этом сеансе запись основного ключа (копия нечитаемой записи не легла).
export function saveBlocked(storage) {
  const store = getStorage(storage);
  return !!store && blocked.has(store);
}

// Загрузка: всё в try/catch, любой сбой → дефолт (но исходник сначала в аварийный слот).
export function load(storage) {
  const store = getStorage(storage);
  if (!store) return defaultState();
  blocked.delete(store);
  let raw = null;
  try {
    raw = store.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    try { if (raw && !keepBroken(store, raw)) blocked.add(store); } catch { blocked.add(store); }
    return defaultState();
  }
}

// Сохранение: переполнение квоты/сбой не должны ронять приложение (§13.2).
export function save(state, storage) {
  const store = getStorage(storage);
  if (!store) return false;
  if (blocked.has(store)) return false; // исходник цел, пока его копия не легла
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // продолжаем в памяти
  }
}

// Нужен ли онбординг (имя пустое) — §7.1.
export function needsOnboarding(state) {
  return !state.profile.name || !state.profile.name.trim();
}

// ——— Чужое состояние: один вход (ТЗ-переезд.md, 3.3) ———
// Файл копии, ссылка переноса и код переноса проходят ровно через эту функцию:
// разбор → «это наш прогресс» → migrate. Другого пути в app.js нет (тест в move.test.js).
// Пределы длины в БАЙТАХ UTF-8 — те же, что у распаковки в move.js (JSON_MAX).
export const INCOMING_MAX_BYTES = 262144;

export function readIncoming(jsonText) {
  if (typeof jsonText !== 'string') return { ok: false, reason: 'not-json' };
  if (new TextEncoder().encode(jsonText).length > INCOMING_MAX_BYTES) return { ok: false, reason: 'too-long' };
  let raw;
  try { raw = JSON.parse(jsonText); } catch { return { ok: false, reason: 'not-json' }; }
  // migrate({}) отдал бы чистое состояние и молча обнулил человека — поэтому проверяем сами.
  if (!isObj(raw) || !(isObj(raw.progress) || isObj(raw.profile))) return { ok: false, reason: 'not-state' };
  return { ok: true, state: migrate(raw) };
}

// Текст файла копии и ядро кода переноса — одна функция на оба случая.
export function exportText(state) {
  return JSON.stringify(state, null, 2);
}
