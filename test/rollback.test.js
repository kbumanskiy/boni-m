// Откат на v25 и смешанный кэш (ТЗ-длинные-радиограммы.md, 4.4, 7.1, 7.3).
//
// Если после выкладки morse-v26 что-то пойдёт не так, на телефоны вернётся код v25 —
// и он прочитает состояние, записанное v26. Здесь проверяется ровно тот код, что стоит
// у людей: снимок модулей v25 лежит в fixtures/v25/ (в корне репозитория — не в test/,
// чтобы node --test не принял их за тесты, и не в app/, чтобы не требовать их в офлайн-кэше).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import * as V26 from '../app/js/state.js';
import { LIMITS } from '../app/js/timing.js';
import * as V25 from '../fixtures/v25/state.js';

// ——— Снимок v25 настоящий ———
// Каждый файл fixtures/v25/*.js = одна строка-шапка + файл из коммита ff06879 как есть.
// Происхождение проверено один раз командой
//   git show ff06879:app/js/<файл>.js | sha256sum      (для app.js — ff06879:app/app.js)
// и записано здесь вторым числом; первое — хэш файла снимка целиком (с шапкой).
const FIXTURES = {
  'state.js':   ['898348e5f66c210a98f39727909e42dfcdc4ffd0dac5f10fd7fd75b3ed2bbff7', '7b11114ceb7136c26657d478599ba67787531c6fd23e9ea37da12389087a3165'],
  'timing.js':  ['13d4c361bf6479acc6f069d674f1b633e4baa3685360ad76ccdc728087360f70', 'b2a2e3017d471d314b974d6d32471dbc489be2868a9ec489828b18b615043bec'],
  'puzzle.js':  ['6ca1f3e20f64f02ec348095b8d6fafa4c109e40477fe663449be8368a1c5ea25', 'b9e3490b922a24034e9cd99a0cae85dd35845631147025b2b9ee469d0058a3ee'],
  'support.js': ['83baf8eef07e80a09c2d63ddca5ae3d12ef6c43269a9134e9a47e9e3fb1bb770', '66d7c617504a40852eec6af58d5a2294eeb61eb562c280d3a0c8bf8476475e45'],
  'audio.js':   ['6055942f3229622e18f980888d13cad43aa52d987e023b420ad0ceffda0c5af4', 'c64916e462225e97a78f6865dfa1b313e2f8248fff2846c29e10e120c74ded46'],
  'data.js':    ['26eec83dff1e32ecb3e691f99dfa91cbdce279484df6f261b83137df155844a6', '5cc101ed7d614fa08292bf2e918c31f34b1511ec5baf3666164571c831aed33e'],
  'radiogram.js': ['70ab5fd4b94377d0c3b625fb207b6916c3bfe47044dfa0eaaeca94effe631b76', '150d35c695a3f1bd02abf2bd821d76a77d4ede2a57b20da3bec96f32b476fd58'],
  'app.js':     ['11d31e1f1a7a4c16d098bb4d65ef6cec3c5d41d761302cdfb0290f03dad3660a', '1a3b84159b561fa563ffa00f70becad64f3bfb87ba77abe48dd6059fccfdb553'],
};
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

test('снимок v25 настоящий: файлы fixtures/v25 совпадают с коммитом ff06879', () => {
  for (const [file, [whole, original]] of Object.entries(FIXTURES)) {
    const buf = readFileSync(new URL(`../fixtures/v25/${file}`, import.meta.url));
    assert.equal(sha(buf), whole, `${file}: снимок изменён`);
    const body = buf.subarray(buf.indexOf(10) + 1); // без строки-шапки
    assert.equal(sha(body), original, `${file}: тело не совпадает с ff06879`);
    assert.match(buf.toString('utf8', 0, 80), /^\/\/ снято с ff06879/, `${file}: нет шапки`);
  }
});

// Состояние v26 со всеми заполненными полями — строится через migrate v26, а не руками:
// рукописное отличалось бы от вывода любой миграции нормализованными полями.
function fullV26() {
  return V26.migrate({
    version: 2,
    profile: { name: 'Бонислав', callsign: 'Boney M', points: 412 },
    progress: {
      ru: { learnedCount: 27, digitsLearned: 6, perChar: { 'Е': { correct: 31, total: 34 }, 'Щ': { correct: 3, total: 9 } },
            recent: [1, 1, 0, 1, 1], parked: [{ char: 'Ь', returnAt: 36 }], lastFirst: 'Щ' },
      en: { learnedCount: 6, digitsLearned: 0, perChar: { 'K': { correct: 5, total: 6 } }, recent: [1, 0], parked: [], lastFirst: 'E' },
    },
    settings: { alphabet: 'ru', charWpm: 20, effWpm: 12, keyWpm: 14, toneHz: 700, volume: 0.6,
      showChants: false, vibration: true, answerSound: false, keyMode: 'free',
      radiogramCpm: 110, radiogramKind: 'mixed', radiogramFull: true,
      theme: 'dark', metrics: false, knowsAll: true,
      radiogramLong: true, radiogramGroups: 50, dahRatio: 4 },
    streak: { current: 9, longest: 21, lastActiveDate: '2026-10-17' },
    records: { radiogramCpm: 100 },
    totalSeconds: 18000,
    history: [{ date: '2026-10-15', answers: 22, accuracyPct: 88 }, { date: '2026-10-17', answers: 30, accuracyPct: 93 }],
    milestones: { first4: true, tenMin: true, radiogram: true, callsign: true },
    puzzle: { word: { seen: ['w01', 'w02'], last: 'w02', solved: ['w01'] }, msg: { seen: [], last: null, solved: ['m03'] },
      riddle: { seen: [], last: null, solved: [] }, story: { seen: [], last: null, solved: [] }, isNew: false },
  });
}
const withoutNew = (s) => {
  const c = structuredClone(s);
  delete c.settings.radiogramLong; delete c.settings.radiogramGroups; delete c.settings.dahRatio;
  return c;
};

test('откат: v25 читает состояние v26 без потерь — пропадают только три новых поля', () => {
  const s26 = fullV26();
  assert.equal(s26.settings.dahRatio, 4, 'вход действительно содержит длинное тире');
  assert.equal(s26.settings.radiogramLong, true, 'вход действительно содержит выбор «Длинная»');
  assert.equal(s26.settings.radiogramGroups, 50);
  assert.deepEqual(s26.progress.ru.parked, [{ char: 'Ь', returnAt: 36 }], 'отложенный знак в настоящем формате');
  const s25 = V25.migrate(JSON.parse(JSON.stringify(s26)));
  assert.deepEqual(s25, withoutNew(s26));
});

test('откат: v25 не падает на новых полях любого типа', () => {
  for (const v of ['строка', { a: 1 }, [1, 2], null, 7, true]) {
    const raw = { ...fullV26() };
    raw.settings = { ...raw.settings, radiogramLong: v, radiogramGroups: v, dahRatio: v };
    assert.doesNotThrow(() => V25.migrate(JSON.parse(JSON.stringify(raw))));
    assert.deepEqual(V25.migrate(JSON.parse(JSON.stringify(raw))), withoutNew(fullV26()));
  }
});

test('откат: radiogramFull — прежний выбор, «Длинная» его не трогала', () => {
  for (const full of [true, false]) {
    const s = fullV26();
    s.settings.radiogramFull = full;
    assert.equal(V25.migrate(JSON.parse(JSON.stringify(s))).settings.radiogramFull, full);
  }
});

test('повторное обновление после отката: новые поля — умолчания, остальное как было', () => {
  const s26 = fullV26();
  const again = V26.migrate(V25.migrate(JSON.parse(JSON.stringify(s26))));
  const want = structuredClone(s26);
  want.settings.radiogramLong = false;
  want.settings.radiogramGroups = LIMITS.radiogramGroups.def;
  want.settings.dahRatio = LIMITS.dahRatio.def; // откат теряет только выбор длины тире — безвредно
  assert.deepEqual(again, want);
});

function mapStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('полный цикл: v26 сохранил → v25 загрузил и сохранил → v26 загрузил — потерь нет', () => {
  const store = mapStore();
  const s26 = fullV26();
  assert.equal(V26.save(s26, store), true);
  const s25 = V25.load(store);
  assert.equal(V25.save(s25, store), true); // первое сохранение старой версией
  const back = V26.load(store);
  const want = structuredClone(s26);
  want.settings.radiogramLong = false;
  want.settings.radiogramGroups = LIMITS.radiogramGroups.def;
  want.settings.dahRatio = LIMITS.dahRatio.def; // откат теряет только выбор длины тире — безвредно
  assert.deepEqual(back, want);
});

// ——— Смешанный кэш: новый state.js со СТАРЫМ timing.js (раздел 7.3) ———
// Исключение в migrate превратилось бы в пустое состояние, а следующее сохранение затёрло бы
// прогресс. Проверяем двумя способами: удалением поля из живого LIMITS и настоящим timing.js v25.
function snapshotV25() {
  return V25.migrate(JSON.parse(JSON.stringify(withoutNew(fullV26()))));
}

test('смешанный кэш: без LIMITS.radiogramGroups новый migrate не бросает и даёт тот же результат', () => {
  const normal = V26.migrate(snapshotV25());
  const saved = LIMITS.radiogramGroups;
  try {
    delete LIMITS.radiogramGroups;
    let got;
    assert.doesNotThrow(() => { got = V26.migrate(snapshotV25()); });
    assert.deepEqual(got, normal);
  } finally { LIMITS.radiogramGroups = saved; }
});

test('смешанный кэш: новый state.js на настоящем timing.js v25 — без исключений, прогресс цел', async () => {
  const realState = new URL('../app/js/state.js', import.meta.url).href;
  const oldTiming = new URL('../fixtures/v25/timing.js', import.meta.url).href;
  const oldPuzzle = new URL('../fixtures/v25/puzzle.js', import.meta.url).href;
  const tagged = realState + '?oldtiming';
  registerHooks({
    resolve(spec, ctx, next) {
      if (ctx.parentURL === tagged && spec === './timing.js') return { url: oldTiming, shortCircuit: true };
      if (ctx.parentURL === tagged && spec === './puzzle.js') return { url: oldPuzzle, shortCircuit: true };
      return next(spec, ctx);
    },
  });
  const Mixed = await import(tagged);
  const OldT = await import(oldTiming);
  assert.equal(OldT.LIMITS.radiogramGroups, undefined, 'подменённый timing.js действительно старый');
  const store = mapStore();
  store.setItem(V26.STORAGE_KEY, JSON.stringify(snapshotV25()));
  const s = Mixed.load(store);
  assert.equal(Mixed.saveBlocked(store), false);
  assert.deepEqual(s, V26.migrate(snapshotV25()), 'то же, что у полностью нового кода');
  assert.equal(s.settings.radiogramGroups, 30);
});

test('повторное обновление после отката: длина тире — «как в эфире» (3)', () => {
  const again = V26.migrate(V25.migrate(JSON.parse(JSON.stringify(fullV26()))));
  assert.equal(again.settings.dahRatio, 3);
});
