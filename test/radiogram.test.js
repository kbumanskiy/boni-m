// Контрольная радиограмма (Правила вида спорта «радиоспорт», приказ Минспорта
// от 28.03.2022 № 230, ст. 18 «Приём радиограмм»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRadiogram, normalize, compare, accepted, score, groupsFor, nextSpeed,
  GROUP_SIZE, MAX_ERRORS, SPEED_STEP, MIXED_PUNCT, chooseSet,
  percentCorrect, sentPrefix, errorList,
} from '../app/js/radiogram.js';
import { KOCH_ORDER_RU } from '../app/js/data.js';

// Повторяемый источник случайности: тест не должен зависеть от везения.
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const LAT = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

test('радиограмма собирается группами по пять знаков', () => {
  const text = makeRadiogram(LAT, 4, seeded(7));
  const groups = text.split(' ');
  assert.equal(groups.length, 4);
  for (const g of groups) assert.equal(g.length, GROUP_SIZE, `группа «${g}»`);
});

test('трёх одинаковых знаков подряд не бывает — в том числе на стыке групп', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const plain = normalize(makeRadiogram(['A', 'B'], 20, seeded(seed))); // тесный набор — худший случай
    assert.ok(!/(.)\1\1/.test(plain), `три подряд в «${plain}» (seed ${seed})`);
  }
});

test('за минуту звучит столько знаков, сколько обещает скорость', () => {
  assert.equal(groupsFor(60), 12);   // 60 знаков в минуту = 12 групп по пять
  assert.equal(groupsFor(100), 20);
  assert.equal(groupsFor(60, 30), 6); // полминуты — вдвое меньше
  assert.ok(groupsFor(40, 10) >= 1, 'даже на коротком заходе есть хотя бы группа');
});

test('разбивка на группы при сверке не важна, регистр тоже', () => {
  assert.equal(normalize('abcde fghij'), 'ABCDEFGHIJ');
  assert.equal(normalize(' a b\nc '), 'ABC');
  assert.equal(compare('ABCDE FGHIJ', 'abcdefghij').errors, 0, 'написал слитно и строчными — принято');
  assert.equal(compare('ABCDE FGHIJ', 'ABC DEFGH IJ').errors, 0, 'разбил иначе — тоже принято');
  // Ноль на экране перечёркнут, а на клавиатуре его набирают обычным — это один знак.
  assert.equal(normalize('Ø7Ø'), '070');
  assert.equal(compare('07025', 'Ø7Ø25').errors, 0);
});

// Главная ловушка сверки: один пропущенный знак сдвигает весь остаток. Считать
// «знак против знака по местам» нельзя — человек с одной опиской получил бы
// столько ошибок, сколько знаков осталось до конца.
test('один пропущенный знак — ровно одна ошибка, а не лавина', () => {
  const sent = 'ABCDE FGHIJ KLMNO PQRST';
  const got = 'ABDE FGHIJ KLMNO PQRST'; // пропущена C — третий знак
  const r = compare(sent, got);
  assert.equal(r.errors, 1, `ошибок ${r.errors}, разбор: ${JSON.stringify(r.cells.filter((c) => c.type !== 'ok'))}`);
  assert.equal(r.cells.filter((c) => c.type === 'missed').length, 1);
});

test('замена, лишний знак и пропуск считаются по одной ошибке каждый', () => {
  assert.equal(compare('ABCDE', 'ABXDE').errors, 1, 'замена');
  assert.equal(compare('ABCDE', 'ABCXDE').errors, 1, 'лишний знак');
  assert.equal(compare('ABCDE', 'ABDE').errors, 1, 'пропуск');
  assert.equal(compare('ABCDE', 'ABCDE').errors, 0, 'всё верно');
  assert.equal(compare('ABCDE', '').errors, 5, 'не принял ничего — ошибок по числу знаков');
});

test('разбор показывает, что именно случилось с каждым знаком', () => {
  const r = compare('ABC', 'AXC');
  assert.deepEqual(r.cells.map((c) => c.type), ['ok', 'wrong', 'ok']);
  assert.equal(r.cells[1].expected, 'B');
  assert.equal(r.cells[1].got, 'X');
  assert.equal(r.correct, 2);
  assert.equal(r.total, 3);
});

test('правило пяти ошибок: до пяти включительно — принята', () => {
  assert.equal(MAX_ERRORS, 5);
  assert.equal(accepted(0), true);
  assert.equal(accepted(5), true);
  assert.equal(accepted(6), false);
});

test('очки за радиограмму — скорость минус ошибки, но не ниже нуля', () => {
  assert.equal(score(60, 0), 60);
  assert.equal(score(60, 4), 56);
  assert.equal(score(30, 40), 0);
});

test('следующая скорость — на десять знаков быстрее, но не выше потолка', () => {
  assert.equal(SPEED_STEP, 10);
  assert.equal(nextSpeed(60), 70);
  assert.equal(nextSpeed(220, 225), 225);
  assert.equal(nextSpeed(225, 225), 225);
});

test('знаки смешанного текста — ровно те, что названы в правилах', () => {
  assert.deepEqual(MIXED_PUNCT, ['.', ',', '/', '?', '=']);
});

test('вырожденные входы не роняют сверку', () => {
  assert.equal(makeRadiogram([], 3), '');
  assert.equal(makeRadiogram(LAT, 0), '');
  assert.equal(compare('', '').errors, 0);
  assert.equal(compare('', 'ABC').errors, 3);
  assert.equal(compare(null, undefined).errors, 0);
});

test('набор знаков: без отметки — только освоенные, с отметкой «Я уже знаю азбуку» — весь курс', () => {
  const order = ['Е', 'Т', 'И', 'М', 'А', 'Н'];
  const digitOrder = [...'0123456789'];
  const base = { order, digitOrder, learnedCount: 4, digitsLearned: 0 };
  assert.deepEqual(chooseSet({ ...base, kind: 'letters' }), ['Е', 'Т', 'И', 'М']);
  assert.deepEqual(chooseSet({ ...base, kind: 'digits' }), []);
  assert.deepEqual(chooseSet({ ...base, kind: 'mixed' }), ['Е', 'Т', 'И', 'М', ...MIXED_PUNCT]);
  assert.deepEqual(chooseSet({ ...base, digitsLearned: 3, kind: 'digits' }), ['0', '1', '2']);
  const all = { ...base, knowsAll: true };
  assert.deepEqual(chooseSet({ ...all, kind: 'letters' }), order);
  assert.deepEqual(chooseSet({ ...all, kind: 'digits' }), digitOrder);
  assert.deepEqual(chooseSet({ ...all, kind: 'mixed' }), [...order, ...digitOrder, ...MIXED_PUNCT]);
  // Исходные порядки не портятся: набор — копия.
  chooseSet({ ...all, kind: 'letters' }).push('X');
  assert.equal(order.length, 6);
});

// ——— Длинная радиограмма: тренировка 20/30/50 групп (ТЗ-длинные-радиограммы.md) ———

test('процент верных: (T − E) / T, не отрицательный при мусоре', () => {
  assert.equal(percentCorrect(150, 0), 100);
  assert.equal(percentCorrect(150, 3), 98);
  assert.equal(percentCorrect(150, 150), 0);
  assert.equal(percentCorrect(150, 400), 0, 'лишние знаки не уводят процент в минус');
  assert.equal(percentCorrect(0, 0), null, 'нечего разбирать — процента нет, деления на ноль нет');
  assert.equal(percentCorrect(3, 1), 67, 'округление до целого');
});

test('переданная часть: первые n знаков, заново по пять', () => {
  assert.equal(sentPrefix('ABCDE FGHIJ', 7), 'ABCDE FG');
  assert.equal(sentPrefix('ABCDE FGHIJ', 0), '');
  assert.equal(sentPrefix('ABCDE FGHIJ', -3), '');
  assert.equal(sentPrefix('ABCDE FGHIJ', 99), 'ABCDE FGHIJ');
  assert.equal(sentPrefix('ABCDE FGHIJ', 10), 'ABCDE FGHIJ');
  assert.equal(sentPrefix('ab Ø\nde fgh', 6), 'AB0DE F', 'регистр, Ø и пробелы нормализуются');
});

test('«Где ошибки»: номера групп для замены, пропуска и лишнего', () => {
  // Группы: ABCDE FGHIJ. Замена C→X (группа 1), пропуск H (группа 2),
  // лишний Z на стыке после E (относится к группе 1 — последний переданный перед ним).
  const r = compare('ABCDE FGHIJ', 'ABXDEZFGIJ');
  const { items, more } = errorList(r.cells);
  assert.equal(more, 0);
  assert.deepEqual(items.map((x) => [x.group, x.type]), [[1, 'wrong'], [1, 'extra'], [2, 'missed']]);
  assert.deepEqual(items[0], { group: 1, type: 'wrong', expected: 'C', got: 'X' });
  assert.deepEqual(items[1], { group: 1, type: 'extra', expected: '', got: 'Z' });
  assert.deepEqual(items[2], { group: 2, type: 'missed', expected: 'H', got: '' });
});

test('«Где ошибки»: лишнее в самом начале — первая группа', () => {
  const r = compare('ABCDE FGHIJ', 'QABCDEFGHIJ');
  assert.deepEqual(errorList(r.cells).items, [{ group: 1, type: 'extra', expected: '', got: 'Q' }]);
});

test('«Где ошибки»: limit режет список, more — сколько осталось', () => {
  const sent = 'ABCDE FGHIJ KLMNO PQRST';
  const r = compare(sent, 'XXXXXXXXXXXXXXXXXXXX'); // 20 замен
  const { items, more } = errorList(r.cells, 10);
  assert.equal(items.length, 10);
  assert.equal(more, 10);
  assert.deepEqual(items.map((x) => x.group), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  assert.equal(errorList(r.cells).items.length, 10, 'по умолчанию — десять');
  assert.deepEqual(errorList(compare(sent, sent).cells), { items: [], more: 0 });
});

test('длинная на тесном наборе: 50 групп по пять, трёх одинаковых подряд нет', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const text = makeRadiogram(['A', 'B'], 50, seeded(seed));
    const groups = text.split(' ');
    assert.equal(groups.length, 50);
    assert.ok(groups.every((g) => g.length === GROUP_SIZE));
    assert.ok(!/(.)\1\1/.test(normalize(text)), `сид ${seed}: три одинаковых подряд`);
  }
});

test('длинная на реальном наборе: 20 первых букв курса — только они', () => {
  const set = KOCH_ORDER_RU.slice(0, 20);
  const plain = normalize(makeRadiogram(set, 50, seeded(3)));
  assert.equal(plain.length, 250);
  assert.ok([...plain].every((ch) => set.includes(ch)));
});

test('сверка 250 знаков — быстро, даже против 600 знаков мусора', () => {
  const sent = makeRadiogram(KOCH_ORDER_RU, 50, seeded(5));
  const t0 = performance.now();
  compare(sent, sent);
  compare(sent, 'Ж'.repeat(600));
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `сверка заняла ${ms.toFixed(1)} мс`);
});

test('одна пропущенная буква в 250 знаках — ровно одна ошибка, без лавины', () => {
  const sent = makeRadiogram(KOCH_ORDER_RU, 50, seeded(9));
  const plain = normalize(sent);
  const r = compare(sent, plain.slice(0, 120) + plain.slice(121));
  assert.equal(r.errors, 1);
  assert.equal(r.total, 250);
});
