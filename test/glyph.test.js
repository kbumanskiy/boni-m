// Спорные начертания: буква и цифра, которые выглядят одинаково.
// Повод — замечание радиолюбителя с форума: «3 и З не различить».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphKind, isAmbiguous, glyphText, glyphName } from '../app/js/glyph.js';
import { RU_LETTERS, DIGITS } from '../app/js/data.js';

test('пара, которую путают на самом деле', () => {
  assert.equal(glyphKind('3'), 'цифра');
  assert.equal(glyphKind('З'), 'буква');
});

// 18 августа 2026: ноль показываем перечёркнутым, поэтому подписывать О и 0 больше незачем.
test('ноль и «о» не подписываются — их развело начертание', () => {
  for (const ch of ['0', 'О', 'O']) assert.equal(glyphKind(ch), '');
});

test('ноль на экране перечёркнут, а внутри остаётся обычным нулём', () => {
  assert.equal(glyphText('0'), 'Ø');
  assert.equal(glyphName('0'), 'ноль');
  // Всё остальное показывается как есть — иначе начертание поехало бы по всей азбуке.
  for (const ch of ['О', 'O', '3', 'З', 'А', '9', 'S']) assert.equal(glyphText(ch), ch);
  for (const ch of ['О', '3', 'А']) assert.equal(glyphName(ch), '');
  assert.equal(glyphText(null), '');
});

// Решение Кости 17 августа 2026: подписывается только З/3. Остальное — шум,
// и в английском режиме оно даже вредило: под латинской «S» стояло слово «буква»,
// хотя S и 5 не похожи ничем.
test('другие похожие знаки НЕ подписываются', () => {
  for (const ch of ['1', 'I', '2', 'Z', '4', 'Ч', '5', 'S', '8', 'B']) {
    assert.equal(glyphKind(ch), '', `${ch} подписывать не надо`);
  }
});

test('обычные знаки не подписываются — иначе подпись станет шумом', () => {
  for (const ch of ['А', 'М', 'Ю', 'Щ', '7', '9', 'K', 'W']) {
    assert.equal(glyphKind(ch), '', `${ch} подписывать не за что`);
  }
});

test('подписанная буква и её цифра-двойник — разные коды, иначе путать было бы не страшно', () => {
  const code = (arr, ch) => arr.find((x) => x.char === ch)?.code;
  assert.notEqual(code(RU_LETTERS, 'З'), code(DIGITS, '3'));
  assert.notEqual(code(RU_LETTERS, 'О'), code(DIGITS, '0')); // развели начертанием, коды всё равно разные
});

test('пустые и странные значения не роняют подпись', () => {
  for (const v of [null, undefined, '', ' ', '..']) assert.equal(glyphKind(v), '');
  assert.equal(isAmbiguous('З'), true);
  assert.equal(isAmbiguous('А'), false);
});
