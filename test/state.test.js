// Тесты состояния и сохранности (ТЗ §2, §13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, migrate, load, save, needsOnboarding, STORAGE_KEY,
} from '../app/js/state.js';
import { LIMITS } from '../app/js/timing.js';

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
  // Позывной по умолчанию пустой: чужой в поле у нового человека — это ровно та жалоба
  // с форума, что упражнение звучит «Boney M». Уже записанный при этом обязан уцелеть.
  assert.equal(s.profile.callsign, '');
  assert.equal(migrate({ profile: { callsign: 'Boney M' } }).profile.callsign, 'Boney M');
  assert.equal(migrate({ profile: { callsign: 'RA9FLC' } }).profile.callsign, 'RA9FLC');
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
  assert.ok(s.settings.toneHz <= LIMITS.toneHz.max && s.settings.toneHz >= LIMITS.toneHz.min);
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

// ——— Настройка обязана дожить до следующего запуска ———
// 17 августа скорость знака сделали регулируемой до 150 зн/мин — и в тот же день
// сломали: миграция состояния зажимала её своим, более узким диапазоном. Человек
// выставлял быструю скорость, закрывал приложение, открывал — и она молча
// возвращалась к прежней. Внешне это ровно та жалоба с форума, ради которой всё
// и делалось. Тест проверяет край каждого регулятора: что предложено на экране,
// то и должно сохраниться.
test('края всех регуляторов переживают сохранение (границы UI = границы миграции)', () => {
  for (const [key, { min, max }] of Object.entries(LIMITS)) {
    for (const edge of [min, max]) {
      // effWpm сверху зажимается скоростью знака — даём ей потолок.
      const raw = { settings: { charWpm: LIMITS.charWpm.max, [key]: edge } };
      const got = migrate(raw).settings[key];
      assert.equal(got, edge, `настройка ${key}: выставили ${edge}, после перезапуска ${got}`);
    }
  }
});

test('выход за края всё ещё зажимается', () => {
  const s = migrate({ settings: { charWpm: 999, toneHz: 5, keyWpm: -3, volume: 42 } });
  assert.equal(s.settings.charWpm, LIMITS.charWpm.max);
  assert.equal(s.settings.toneHz, LIMITS.toneHz.min);
  assert.equal(s.settings.keyWpm, LIMITS.keyWpm.min);
  assert.equal(s.settings.volume, LIMITS.volume.max);
});

// ——— Радиоигра: поле puzzle и пометка «Новое» (КОНЦЕПТ-викторина.md) ———
const EMPTY_DECK = { seen: [], last: null, solved: [] };

test('Радиоигра: старое состояние (прогресс есть, puzzle нет) → isNew, колоды пусты, остальное на месте', () => {
  const old = {
    version: 2,
    profile: { name: 'Бонислав', callsign: 'Boney M', points: 148 },
    progress: { ru: { learnedCount: 20, perChar: { 'Е': { correct: 31, total: 34 } } } },
    settings: { charWpm: 20, effWpm: 10, theme: 'dark' },
    milestones: { first10: true },
  };
  const s = migrate(old);
  assert.equal(s.puzzle.isNew, true);
  for (const c of ['word', 'msg', 'riddle', 'story']) assert.deepEqual(s.puzzle[c], EMPTY_DECK, c);
  assert.equal(s.progress.ru.learnedCount, 20);
  assert.deepEqual(s.progress.ru.perChar['Е'], { correct: 31, total: 34 });
  assert.deepEqual(s.milestones, { first10: true });
  assert.equal(s.settings.charWpm, 20);
  assert.equal(s.settings.theme, 'dark');
  assert.equal(s.version, 2, 'STATE_VERSION не поднимается');
});

test('Радиоигра: чистая установка → isNew:false', () => {
  assert.equal(defaultState().puzzle.isNew, false);
  assert.equal(load(mockStore()).puzzle.isNew, false);
  // Состояние без прогресса (например, только настройки) — не «старый пользователь».
  assert.equal(migrate({ settings: { theme: 'dark' } }).puzzle.isNew, false);
  assert.equal(migrate(null).puzzle.isNew, false);
});

test('Радиоигра: isNew берётся из сохранённого, когда puzzle уже есть', () => {
  assert.equal(migrate({ progress: {}, puzzle: { isNew: false } }).puzzle.isNew, false);
  assert.equal(migrate({ progress: {}, puzzle: { isNew: true } }).puzzle.isNew, true);
  assert.equal(migrate({ progress: {}, puzzle: { isNew: 'да' } }).puzzle.isNew, false);
  assert.equal(migrate({ progress: {}, puzzle: 'мусор' }).puzzle.isNew, false);
});

test('Радиоигра: мусор в puzzle отбрасывается (чужие id, повторы, не-массивы, last вне каталога)', () => {
  const s = migrate({
    progress: {},
    puzzle: {
      word: { seen: ['w01', 'w01', 'm01', '<img onerror=x>', 7, 'w02'], last: 'w99', solved: ['w03', 'w03'] },
      msg: { seen: 'm01', last: 'm05', solved: { m01: true } },
      riddle: [1, 2, 3],
      story: null,
      evil: { seen: ['s01'] },
      isNew: false,
    },
  });
  assert.deepEqual(s.puzzle.word, { seen: ['w01', 'w02'], last: null, solved: ['w03'] });
  assert.deepEqual(s.puzzle.msg, { seen: [], last: 'm05', solved: [] });
  assert.deepEqual(s.puzzle.riddle, EMPTY_DECK);
  assert.deepEqual(s.puzzle.story, EMPTY_DECK);
  assert.deepEqual(Object.keys(s.puzzle), ['word', 'msg', 'riddle', 'story', 'isNew']);
});

test('Радиоигра: сохранение → загрузка сохраняет колоды и isNew:false', () => {
  const store = mockStore(JSON.stringify({ progress: { ru: { learnedCount: 5 } } }));
  const s = load(store);
  assert.equal(s.puzzle.isNew, true, 'старый пользователь');
  s.puzzle.isNew = false; // вошёл в режим
  s.puzzle.word = { seen: ['w01', 'w07'], last: 'w07', solved: ['w01'] };
  s.puzzle.story.solved.push('s03');
  save(s, store);
  const again = load(store);
  assert.equal(again.puzzle.isNew, false, 'после перезапуска пометка не возвращается');
  assert.deepEqual(again.puzzle.word, { seen: ['w01', 'w07'], last: 'w07', solved: ['w01'] });
  assert.deepEqual(again.puzzle.story.solved, ['s03']);
  assert.equal(again.progress.ru.learnedCount, 5);
});
