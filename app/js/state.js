// Состояние и сохранность (ТЗ §2, §13). Ключ localStorage — boni_m_state.
// Всё чтение/запись в try/catch; битый/отсутствующий state → дефолт; квота → работаем в памяти.
import { clampEff } from './timing.js';

export const STORAGE_KEY = 'boni_m_state';
export const STATE_VERSION = 2;

export function defaultState() {
  return {
    version: STATE_VERSION,
    profile: { name: '', callsign: 'Boney M', points: 0 },
    progress: {
      ru: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [] },
      en: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [] },
    },
    settings: {
      alphabet: 'ru', charWpm: 18, effWpm: 9, keyWpm: 12,
      toneHz: 600, volume: 0.5, showChants: true, vibration: true,
      keyMode: 'train', // режим «Ключа»: 'train' (с подсказкой) | 'free' (свободный набор)
    },
    streak: { current: 0, longest: 0, lastActiveDate: null },
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
    s.profile.callsign = typeof raw.profile.callsign === 'string' && raw.profile.callsign
      ? raw.profile.callsign : 'Boney M';
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
    s.settings.charWpm = clampNum(r.charWpm, 15, 22, 18);
    s.settings.effWpm = clampEff(clampNum(r.effWpm, 5, 22, 9), s.settings.charWpm);
    s.settings.keyWpm = clampNum(r.keyWpm, 8, 18, 12);
    s.settings.toneHz = clampNum(r.toneHz, 500, 800, 600);
    s.settings.volume = clampNum(r.volume, 0, 1, 0.5);
    s.settings.showChants = r.showChants !== false;
    s.settings.vibration = r.vibration !== false;
    s.settings.keyMode = r.keyMode === 'free' ? 'free' : 'train';
  }
  // Серия дней
  if (isObj(raw.streak)) {
    s.streak.current = Math.max(0, Math.floor(num(raw.streak.current, 0)));
    s.streak.longest = Math.max(0, Math.floor(num(raw.streak.longest, 0)));
    s.streak.lastActiveDate = typeof raw.streak.lastActiveDate === 'string'
      ? raw.streak.lastActiveDate : null;
  }
  s.totalSeconds = Math.max(0, num(raw.totalSeconds, 0));
  s.history = Array.isArray(raw.history) ? raw.history.slice(-30) : [];
  s.milestones = isObj(raw.milestones) ? raw.milestones : {};
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
