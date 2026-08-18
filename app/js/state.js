// Состояние и сохранность (ТЗ §2, §13). Ключ localStorage — boni_m_state.
// Всё чтение/запись в try/catch; битый/отсутствующий state → дефолт; квота → работаем в памяти.
import { clampEff, LIMITS } from './timing.js';

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
      theme: 'auto',    // оформление: 'auto' (как в телефоне) | 'light' | 'dark'
    },
    streak: { current: 0, longest: 0, lastActiveDate: null },
    // Личные рекорды. Пока один: самая быстрая ПРИНЯТАЯ контрольная радиограмма —
    // единственная величина, которую радист сравнивает с разрядными нормами.
    records: { radiogramCpm: 0 },
    totalSeconds: 0,
    history: [],
    milestones: {},
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const clampNum = (v, lo, hi, d) => Math.min(hi, Math.max(lo, num(v, d)));

function sanitizeTrack(raw, def) {
  const t = isObj(raw) ? raw : {};
  return {
    learnedCount: Math.max(0, Math.floor(num(t.learnedCount, def.learnedCount))),
    digitsLearned: Math.max(0, Math.floor(num(t.digitsLearned, def.digitsLearned))),
    perChar: isObj(t.perChar) ? t.perChar : {},
    recent: Array.isArray(t.recent) ? t.recent.slice(-30) : [],
    parked: Array.isArray(t.parked) ? t.parked.slice(0, 2) : [], // одновременно не более двух (§6.1)
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
    s.settings.theme = ['light', 'dark'].includes(r.theme) ? r.theme : 'auto';
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
  s.version = STATE_VERSION;
  return s;
}

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

// Загрузка: всё в try/catch, любой сбой → дефолт.
export function load(storage) {
  const store = getStorage(storage);
  if (!store) return defaultState();
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

// Сохранение: переполнение квоты/сбой не должны ронять приложение (§13.2).
export function save(state, storage) {
  const store = getStorage(storage);
  if (!store) return false;
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
