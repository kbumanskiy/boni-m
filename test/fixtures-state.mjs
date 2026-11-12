// Общие входы дымовых тестов: снимок состояния v25 (ТЗ-длинные-радиограммы.md, 4.8; ТЗ-переезд.md, 13).
// Пропущен через migrate НАСТОЯЩЕГО кода v25 (fixtures/v25/state.js) — это ровно то, что лежит
// в хранилище у людей. parked — в настоящем формате { char, returnAt }.
// Это не .test.js, поэтому node --test его не подхватывает.
import * as V25 from '../fixtures/v25/state.js';
import { MILESTONES } from '../app/js/gamify.js';

export const V25_MILESTONES = ['first4', 'tenMin', 'radiogram', 'callsign', 'half'];

export function localDay(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// yesterday — дата последнего занятия (по умолчанию «вчера» по часам машины; для образцов
// формата переноса передаётся фиксированная).
export function v25State(yesterday = localDay(-1)) {
  const MS = V25_MILESTONES;
  for (const k of MS) if (!MILESTONES[k]) throw new Error(`веха ${k} не найдена в каталоге`);
  const def25 = V25.defaultState();
  return V25.migrate({
  version: 2,
  profile: { name: 'Бонислав', callsign: 'Boney M', points: 412 },
  progress: {
    ru: { learnedCount: 27, digitsLearned: 6,
          perChar: { 'Е': { correct: 31, total: 34 }, 'Ь': { correct: 4, total: 11 }, 'Щ': { correct: 6, total: 8 } },
          recent: [1, 1, 0, 1, 1, 1, 1, 0, 1, 1], parked: [{ char: 'Ь', returnAt: 36 }], lastFirst: 'Щ' },
    en: { learnedCount: 6, digitsLearned: 0, perChar: { 'K': { correct: 9, total: 10 } }, recent: [1, 1, 1], parked: [], lastFirst: 'E' },
  },
  settings: { alphabet: 'ru', charWpm: 20, effWpm: 12, keyWpm: 14, toneHz: 700, volume: 0.6,
    showChants: false, vibration: true, answerSound: false, keyMode: 'free',
    radiogramCpm: 110, radiogramKind: 'mixed', radiogramFull: true,
    theme: 'dark', metrics: false, knowsAll: true },
  streak: { current: 9, longest: 21, lastActiveDate: yesterday },
  records: { radiogramCpm: 100 },
  totalSeconds: 18000,
  history: [{ date: '2026-10-13', answers: 22, accuracyPct: 88 }, { date: '2026-10-15', answers: 31, accuracyPct: 91 },
    { date: yesterday, answers: 25, accuracyPct: 94 }],
  milestones: Object.fromEntries(MS.map((k) => [k, true])),
  puzzle: { ...structuredClone(def25.puzzle), word: { seen: ['w01', 'w05'], last: 'w05', solved: ['w01'] }, isNew: false },
  });
}

// Сырое состояние прежней сборки на телефоне папы (test/smoke-upgrade.mjs): НЕТ полей lastFirst и
// settings.theme, вехи не записаны. НЕ пропущено через migrate — это ровно то, что лежит в хранилище,
// поэтому только оно по-настоящему упражняет ужесточение migrate (test/move.test.js, 9).
export const PAPA_OLD_STATE = {
  version: 2,
  profile: { name: 'Бонислав', callsign: 'Boney M', points: 148 },
  progress: {
    ru: {
      learnedCount: 20, digitsLearned: 0,
      perChar: { 'Е': { correct: 31, total: 34 }, 'Ь': { correct: 9, total: 11 } },
      recent: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      parked: [],
    },
    en: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [] },
  },
  settings: {
    alphabet: 'ru', charWpm: 18, effWpm: 9, keyWpm: 12,
    toneHz: 600, volume: 0.5, showChants: true, vibration: true, keyMode: 'train',
  },
  streak: { current: 4, longest: 7, lastActiveDate: '2026-07-29' },
  totalSeconds: 3420,
  history: [{ date: '2026-07-29', answers: 24, accuracyPct: 87 }],
  milestones: {},
};
