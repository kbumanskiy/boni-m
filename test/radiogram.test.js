// Контрольная радиограмма (Правила вида спорта «радиоспорт», приказ Минспорта
// от 28.03.2022 № 230, ст. 18 «Приём радиограмм»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRadiogram, normalize, compare, accepted, score, groupsFor, nextSpeed,
  GROUP_SIZE, MAX_ERRORS, SPEED_STEP, MIXED_PUNCT,
} from '../app/js/radiogram.js';

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
