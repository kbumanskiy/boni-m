// Тесты тайминга (ТЗ §5) — сверка формул PARIS + Фарнсуорт и порогов «Ключа».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  charTiming, ditSeconds, codeToSchedule, codeDuration, clampEff,
  keyThresholds, classifyHold, classifyGap,
} from '../app/js/timing.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('точка = 1.2/C', () => {
  assert.ok(approx(ditSeconds(18), 1.2 / 18));
  assert.ok(approx(ditSeconds(12), 0.1)); // keyWpm 12 → dit = 100 мс (комфортно, §7.3)
});

test('C=18, E=9: длительности совпадают с формулой Фарнсуорта', () => {
  const t = charTiming(18, 9);
  assert.ok(approx(t.dit, 1.2 / 18));
  assert.ok(approx(t.dah, 3 * 1.2 / 18));
  assert.ok(approx(t.intraGap, t.dit));
  // ta = (60*18 - 37.2*9)/(18*9) = (1080 - 334.8)/162 = 745.2/162
  const ta = (60 * 18 - 37.2 * 9) / (18 * 9);
  const fUnit = ta / 19;
  assert.ok(approx(t.charGap, 3 * fUnit), 'charGap = 3*fUnit');
  assert.ok(approx(t.wordGap, 7 * fUnit), 'wordGap = 7*fUnit');
  // Контрольное число: charGap ≈ 0.726 с
  assert.ok(approx(t.charGap, 0.7263157894736842, 1e-6), `charGap=${t.charGap}`);
});

test('Фарнсуорт растягивает паузы: на медленной E паузы заметно длиннее', () => {
  const fast = charTiming(18, 18); // E=C, без растяжки
  const slow = charTiming(18, 6);  // медленнее
  assert.ok(slow.charGap > fast.charGap * 2, 'медленная E → намного длиннее межзнаковая пауза');
  assert.ok(approx(slow.dit, fast.dit), 'сами знаки той же длины (Кох)');
});

test('E >= C: Фарнсуорт выключается, паузы стандартные', () => {
  const t = charTiming(18, 25); // E>C, должно зажаться до C
  assert.ok(approx(t.charGap, 3 * t.dit));
  assert.ok(approx(t.wordGap, 7 * t.dit));
});

test('clampEff не даёт E превысить C', () => {
  assert.equal(clampEff(20, 18), 18);
  assert.equal(clampEff(9, 18), 9);
});

test('расписание знака: точки и тире нужной длины с паузами между', () => {
  const t = charTiming(18, 9);
  const sched = codeToSchedule('-.', 18, 9); // Н = тире, пауза, точка
  assert.equal(sched.length, 3);
  assert.deepEqual(sched.map(s => s.kind), ['dah', 'intra', 'dit']);
  assert.ok(approx(sched[0].dur, t.dah));
  assert.ok(approx(sched[1].dur, t.intraGap));
  assert.ok(approx(sched[2].dur, t.dit));
  // одиночный элемент — без паузы
  assert.equal(codeToSchedule('.', 18, 9).length, 1);
});

test('codeDuration = сумма сегментов', () => {
  const t = charTiming(18, 9);
  assert.ok(approx(codeDuration('-.', 18, 9), t.dah + t.intraGap + t.dit));
});

test('Ключ: пороги от keyDit (keyWpm=12 → dit=100мс)', () => {
  const th = keyThresholds(12);
  assert.ok(approx(th.keyDit, 0.1));
  assert.ok(approx(th.elementMax, 0.2));
  assert.ok(approx(th.charGapMin, 0.3));
  assert.ok(approx(th.wordGapMin, 0.7));
  assert.ok(approx(th.debounceMin, 0.03));
});

test('Ключ: классификация удержания в точку/тире', () => {
  assert.equal(classifyHold(0.08, 12), '.'); // короткое
  assert.equal(classifyHold(0.20, 12), '.'); // ровно на границе 2*dit → точка
  assert.equal(classifyHold(0.35, 12), '-'); // длинное → тире
});

test('Ключ: классификация паузы intra/char/word', () => {
  assert.equal(classifyGap(0.1, 12), 'intra'); // < 3*dit
  assert.equal(classifyGap(0.4, 12), 'char');  // >= 3*dit, < 7*dit
  assert.equal(classifyGap(0.8, 12), 'word');  // >= 7*dit
});
