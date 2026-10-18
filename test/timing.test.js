// Тесты тайминга (ТЗ §5) — сверка формул PARIS + Фарнсуорт и порогов «Ключа».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  charTiming, ditSeconds, codeToSchedule, codeDuration, clampEff,
  keyThresholds, classifyHold, classifyGap, slowerEff, LIMITS,
  sequenceTimeline, estimateRadiogramSeconds,
} from '../app/js/timing.js';
import { CODE_BY_CHAR, DIGIT_ORDER, KOCH_ORDER_RU } from '../app/js/data.js';

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
  // Паузы намеренно длиннее формулы ТЗ: по ней конец знака наступал через 0,3 с, и
  // спокойные касания 73-летней руки не укладывались — «С» распадалась на «Е Е Е».
  assert.ok(approx(th.charGapMin, 0.6), `конец знака ${th.charGapMin}`);
  assert.ok(approx(th.wordGapMin, 1.1), `конец слова ${th.wordGapMin}`);
  assert.ok(th.wordGapMin > th.charGapMin, 'пауза слова всегда длиннее паузы знака');
  assert.ok(approx(th.debounceMin, 0.03));
});

test('Ключ: классификация удержания в точку/тире', () => {
  assert.equal(classifyHold(0.08, 12), '.'); // короткое
  assert.equal(classifyHold(0.20, 12), '.'); // ровно на границе 2*dit → точка
  assert.equal(classifyHold(0.35, 12), '-'); // длинное → тире
});

test('Ключ: классификация паузы intra/char/word', () => {
  assert.equal(classifyGap(0.1, 12), 'intra');  // внутри знака
  assert.equal(classifyGap(0.4, 12), 'intra',
    'полсекунды раздумья внутри буквы больше не разрывают её');
  assert.equal(classifyGap(0.7, 12), 'char');   // конец знака
  assert.equal(classifyGap(1.3, 12), 'word');   // конец слова
});

test('на спокойных скоростях пауза конца знака посильна пожилой руке', () => {
  // До обычной скорости включительно запас держим прежний: три неторопливых касания
  // внутри буквы должны уложиться, иначе «С» распадается на «Е Е Е».
  for (const wpm of [5, 8, 10, 12]) {
    const th = keyThresholds(wpm);
    assert.ok(th.charGapMin >= 0.6, `скорость ${wpm}: конец знака через ${th.charGapMin}с — слишком быстро`);
  }
  // Выше — запас тает: иначе быстрый радист ждал бы после каждой буквы вчетверо
  // дольше нормы, а буквы всё равно слипались бы. Но и меньше нормы порог не станет.
  for (const wpm of [18, 25]) {
    const th = keyThresholds(wpm);
    const norm = 3 * (1.2 / wpm);
    assert.ok(th.charGapMin >= norm, `скорость ${wpm}: порог ниже стандартной паузы знака`);
    assert.ok(th.charGapMin >= 0.25, `скорость ${wpm}: конец знака через ${th.charGapMin}с — не успеть`);
    assert.ok(th.charGapMin < 0.6, `скорость ${wpm}: запас для спокойной руки мешает быстрой`);
  }
  // Слово от знака отделено всегда с заметным зазором — иначе пробелы посыплются сами.
  for (const wpm of [5, 8, 12, 18, 25]) {
    const th = keyThresholds(wpm);
    assert.ok(th.wordGapMin - th.charGapMin >= 0.4,
      `скорость ${wpm}: между концом знака и концом слова всего ${(th.wordGapMin - th.charGapMin).toFixed(2)}с`);
  }
});

test('«Медленнее» никогда не быстрее обычного, в том числе на минимальной скорости', () => {
  const min = LIMITS.effWpm.min;
  for (const c of [5, 18, 45]) {
    for (let e = min; e <= c; e++) {
      const slow = slowerEff(e, c);
      assert.ok(slow <= e, `E=${e}, C=${c}: «Медленнее» дало ${slow} — быстрее обычного`);
      assert.ok(slow >= min, `E=${e}, C=${c}: ниже нижней границы настроек (${slow})`);
      assert.ok(charTiming(c, slow).charGap >= charTiming(c, e).charGap, `E=${e}: паузы не длиннее`);
    }
  }
  assert.equal(slowerEff(min, 18), min, 'на минимуме — не быстрее (раньше давало 5)');
  assert.equal(slowerEff(9, 18), 6, 'обычный случай: на 3 медленнее');
});

// ——— Длинная радиограмма (ТЗ-длинные-радиограммы.md, 2.1, 2.7, 3.2) ———

// Единственное место в тестах, где список записан числами: это решение выпуска.
// Запасной путь «50 заикается» меняет ровно эту строку и LIMITS (раздел 8 ТЗ).
test('число групп длинной радиограммы — 20, 30, 50; умолчание из списка', () => {
  assert.deepEqual(LIMITS.radiogramGroups.options, [20, 30, 50]);
  assert.equal(LIMITS.radiogramGroups.def, 30);
  assert.ok(LIMITS.radiogramGroups.options.includes(LIMITS.radiogramGroups.def));
});

const codeRu = (ch) => CODE_BY_CHAR.ru.get(ch) || '';

test('план передачи: «E» на 20 WPM — точка плюс пауза после знака, как у playSequence', () => {
  const t = charTiming(20, 20);
  const tl = sequenceTimeline(['E'], () => '.', 20, 20);
  assert.deepEqual(tl.starts, [0]);
  assert.ok(approx(tl.total, t.dit + t.charGap), `total=${tl.total}`);
  assert.ok(approx(tl.total, 0.24, 1e-9));
});

test('план передачи: «EE» — второй знак после точки и паузы', () => {
  const t = charTiming(20, 20);
  const tl = sequenceTimeline(['E', 'E'], () => '.', 20, 20);
  assert.ok(approx(tl.starts[1], t.dit + t.charGap));
});

test('план передачи: пробел добавляет паузу слова и не даёт записи; неизвестный знак пропускается', () => {
  const t = charTiming(20, 20);
  const tl = sequenceTimeline(['E', ' ', '?', 'E'], (ch) => (ch === 'E' ? '.' : ''), 20, 20);
  assert.equal(tl.starts.length, 2);
  assert.ok(approx(tl.starts[1], t.dit + t.charGap + t.wordGap));
});

test('оценка длительности по набору: 50 групп цифр на 40 зн/мин — около 11,5 минуты, буквы короче', () => {
  const digits = estimateRadiogramSeconds(DIGIT_ORDER, codeRu, 50, 8);
  assert.ok(Math.abs(digits / 60 - 11.5) <= 0.5, `цифры: ${(digits / 60).toFixed(2)} мин`);
  const letters = estimateRadiogramSeconds(KOCH_ORDER_RU.slice(0, 20), codeRu, 50, 8);
  assert.ok(letters < digits, 'буквы короче цифр');
  // Сверка с настоящим планом передачи: оценка — это среднее, а не случайный текст.
  const text = [];
  for (let g = 0; g < 50; g++) { if (g) text.push(' '); for (let i = 0; i < 5; i++) text.push(DIGIT_ORDER[(g * 5 + i) % 10]); }
  const real = sequenceTimeline(text, codeRu, 8, 8).total;
  assert.ok(Math.abs(real - digits) < 1, `оценка ${digits.toFixed(1)} с, план ${real.toFixed(1)} с`);
  assert.equal(estimateRadiogramSeconds([], codeRu, 50, 8), 0);
});

// ——— Длина тире (ТЗ-длина-тире.md, раздел 5, тесты 1–5) ———
const PAIRS = [[18, 18], [18, 9], [8, 3], [45, 20]];

test('длина тире: без параметра и при r = 3 — ровно как было (тире = 3 точки)', () => {
  for (const [C, E] of PAIRS) {
    const base = charTiming(C, E);
    assert.deepEqual(charTiming(C, E, 3), base);
    assert.ok(approx(base.dah, 3 * base.dit));
  }
});

test('длина тире: r = 3,5 и 4 меняют только тире; точка и все паузы прежние', () => {
  for (const [C, E] of PAIRS) {
    const base = charTiming(C, E);
    for (const r of [3.5, 4]) {
      const t = charTiming(C, E, r);
      assert.ok(approx(t.dah, r * t.dit), `C=${C} E=${E} r=${r}: тире ${t.dah}`);
      for (const k of ['dit', 'intraGap', 'charGap', 'wordGap']) {
        assert.equal(t[k], base[k], `C=${C} E=${E} r=${r}: ${k} изменился — Фарнсуорт не компенсируем`);
      }
    }
  }
});

test('длина тире: мусор (NaN, 10, 2, «4», null) — как r = 3', () => {
  for (const junk of [NaN, 10, 2, '4', null, Infinity, {}]) {
    assert.deepEqual(charTiming(18, 9, junk), charTiming(18, 9), `мусор ${String(junk)}`);
  }
});

test('длина тире: «К» при r = 4 — два тона по 4 точки и один по точке, длительность — сумма', () => {
  const dit = 1.2 / 18;
  const sched = codeToSchedule('-.-', 18, 9, 4);
  const tones = sched.filter((x) => x.tone).map((x) => x.dur);
  assert.equal(tones.length, 3);
  assert.ok(approx(tones[0], 4 * dit) && approx(tones[2], 4 * dit), 'тире по 4 точки');
  assert.ok(approx(tones[1], dit), 'точка прежняя');
  const sum = sched.reduce((s, x) => s + x.dur, 0);
  assert.ok(approx(codeDuration('-.-', 18, 9, 4), sum));
  assert.ok(approx(codeDuration('-.-', 18, 9, 4) - codeDuration('-.-', 18, 9), 2 * dit), 'на две точки длиннее');
});

test('длина тире: LIMITS.dahRatio — ступени по возрастанию внутри [min, max], умолчание 3', () => {
  const L = LIMITS.dahRatio;
  assert.ok(L && Array.isArray(L.steps) && L.steps.length === 3);
  assert.deepEqual([...L.steps].sort((a, b) => a - b), L.steps, 'по возрастанию');
  for (const s of L.steps) assert.ok(s >= L.min && s <= L.max, `ступень ${s} вне границ`);
  assert.ok(L.steps.includes(L.def));
  assert.equal(L.steps[0], 3);
  assert.equal(L.def, 3);
});
