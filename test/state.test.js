// Тесты состояния и сохранности (ТЗ §2, §13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, migrate, load, save, needsOnboarding, STORAGE_KEY,
} from '../app/js/state.js';

// Мок localStorage.
function mockStore(initial = null) {
  let v = initial;
  return {
    getItem: (k) => (k === STORAGE_KEY ? v : null),
    setItem: (k, val) => { if (k === STORAGE_KEY) v = val; },
    _raw: () => v,
  };
}
// Хранилище, бросающее на запись (имитация переполнения квоты §13.2).
function brokenStore() {
  return {
    getItem: () => 'не-json{{{',
    setItem: () => { throw new Error('QuotaExceeded'); },
  };
}

test('дефолт: корректная структура и нужен онбординг', () => {
  const s = defaultState();
  assert.equal(s.version, 2);
  assert.equal(s.profile.callsign, 'Boney M');
  assert.equal(s.settings.alphabet, 'ru');
  assert.ok(needsOnboarding(s), 'пустое имя → онбординг');
});

test('битый JSON в хранилище → дефолт, без падения', () => {
  const s = load(brokenStore());
  assert.equal(s.profile.name, '');
  assert.equal(s.progress.ru.learnedCount, 0);
});

test('миграция сохраняет накопленный прогресс', () => {
  const old = {
    version: 1,
    profile: { name: 'Бонислав', callsign: 'Boney M', points: 42 },
    progress: { ru: { learnedCount: 7, digitsLearned: 0, perChar: { 'Е': { correct: 9, total: 10 } }, recent: [1, 0, 1], parked: [] } },
    settings: { alphabet: 'ru', effWpm: 9 },
    streak: { current: 3, longest: 5, lastActiveDate: '2026-06-12' },
    totalSeconds: 500,
  };
  const s = migrate(old);
  assert.equal(s.version, 2);
  assert.equal(s.profile.name, 'Бонислав');
  assert.equal(s.profile.points, 42);
  assert.equal(s.progress.ru.learnedCount, 7);
  assert.deepEqual(s.progress.ru.perChar['Е'], { correct: 9, total: 10 });
  assert.equal(s.streak.current, 3);
  assert.ok(s.progress.en, 'недостающий трек en создан');
});

test('миграция зажимает настройки и держит инвариант E <= C', () => {
  const s = migrate({ settings: { charWpm: 18, effWpm: 30, toneHz: 9999, volume: 5 } });
  assert.ok(s.settings.effWpm <= s.settings.charWpm, 'E не больше C');
  assert.ok(s.settings.toneHz <= 800 && s.settings.toneHz >= 500);
  assert.ok(s.settings.volume <= 1);
});

test('parked обрезается до двух, recent до 30', () => {
  const s = migrate({
    progress: { ru: { parked: [{ char: 'А' }, { char: 'Б' }, { char: 'В' }], recent: new Array(50).fill(1) } },
  });
  assert.equal(s.progress.ru.parked.length, 2);
  assert.equal(s.progress.ru.recent.length, 30);
});

test('сохранение и загрузка делают круг без потерь', () => {
  const store = mockStore();
  const s = defaultState();
  s.profile.name = 'Бонислав';
  s.progress.ru.learnedCount = 9;
  assert.equal(save(s, store), true);
  const loaded = load(store);
  assert.equal(loaded.profile.name, 'Бонислав');
  assert.equal(loaded.progress.ru.learnedCount, 9);
});

test('переполнение квоты при сохранении не роняет приложение', () => {
  assert.equal(save(defaultState(), brokenStore()), false);
});
