// Переход со СТАРОГО сохранённого состояния на новую сборку.
// Единственное развёртывание, которое реально важно, — телефон папы, а там лежит состояние,
// записанное прежней версией: без lastFirst, без settings.theme, с прежним набором вех.
// Все остальные тесты стартуют с defaultState() и этот путь не проверяют.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, needsOnboarding } from '../app/js/state.js';
import { activeSet, pickFirstTarget, shouldOpenNext, recordAnswer } from '../app/js/progress.js';
import { checkMilestones } from '../app/js/gamify.js';

// Ровно то, что могла записать прежняя сборка: полей lastFirst и theme в ней не было.
function oldSavedState() {
  return {
    version: 2,
    profile: { name: 'Бонислав', callsign: 'Boney M', points: 148 },
    progress: {
      ru: {
        learnedCount: 9, digitsLearned: 0,
        perChar: { 'Е': { correct: 31, total: 34 }, 'М': { correct: 24, total: 27 } },
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
    milestones: { first4: true, tenMin: true },
  };
}

test('старое состояние переносится без потери прогресса', () => {
  const s = migrate(oldSavedState());
  assert.equal(s.progress.ru.learnedCount, 9, 'освоенные буквы на месте');
  assert.equal(s.profile.points, 148, 'очки на месте');
  assert.equal(s.streak.longest, 7, 'лучшая серия на месте');
  assert.equal(s.history.length, 1, 'журнал занятий на месте');
  assert.equal(s.progress.ru.perChar['Е'].total, 34, 'статистика по знакам на месте');
  assert.equal(needsOnboarding(s), false, 'папу не заставят знакомиться заново');
});

test('новые поля получают безопасные значения, а не undefined', () => {
  const s = migrate(oldSavedState());
  assert.equal(s.settings.theme, 'auto', 'тема — как в телефоне');
  assert.equal(s.progress.ru.lastFirst, null, 'знака «начали в прошлый раз» ещё нет');
  assert.equal(s.progress.en.lastFirst, null);
  // Пустой lastFirst не должен ломать выбор первого знака занятия.
  const active = activeSet(s.progress.ru, 'ru');
  const first = pickFirstTarget(active, s.progress.ru.lastFirst);
  assert.ok(active.includes(first), 'первый знак занятия выбран из активного набора');
});

test('битое значение темы не подсовывает несуществующее оформление', () => {
  const raw = oldSavedState();
  raw.settings.theme = 'неоновая';
  assert.equal(migrate(raw).settings.theme, 'auto');
});

// Главное: вехи, заслуженные ПРОШЛОЙ версией, не должны выпадать баннером посреди занятия
// на новой. Именно из-за такого «поздравления не к месту» и затевалась починка.
test('вехи, заслуженные давно, не выстреливают баннером в новой сборке', () => {
  const raw = oldSavedState();
  raw.milestones = {};                 // прежняя сборка могла не записать веху
  raw.progress.ru.learnedCount = 20;   // порог «половина алфавита» давно пройден
  const s = migrate(raw);

  // Приложение при запуске тихо доначисляет заслуженные знаковые вехи.
  const atStart = checkMilestones(s, { triggers: ['chars'] });
  assert.ok(atStart.includes('first4'), 'веха за первые 4 знака доначислена при запуске');
  assert.ok(atStart.includes('half'), 'веха за половину алфавита доначислена при запуске');

  // После этого первый же ответ на занятии не приносит ни одной «новой» вехи.
  recordAnswer(s.progress.ru, 'Е', true);
  assert.deepEqual(checkMilestones(s, { triggers: ['chars'] }), [],
    'посреди занятия старые вехи молчат');
});

test('старое состояние не открывает новый знак раньше верного ответа', () => {
  const s = migrate(oldSavedState());
  const t = s.progress.ru;
  // В перенесённом окне 20 верных ответов — порог по общей точности пройден.
  // Но новейший знак ещё не отвечен 6 раз, поэтому продвижения быть не должно.
  assert.equal(shouldOpenNext(t, 'ru'), false,
    'после переноса знак не открывается «сам собой» на первом же ответе');
});
