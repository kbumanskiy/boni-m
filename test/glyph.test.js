// Спорные начертания: буква и цифра, которые выглядят одинаково.
// Повод — замечание радиолюбителя с форума: «3 и З не различить».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphKind, isAmbiguous } from '../app/js/glyph.js';
import { RU_LETTERS, DIGITS } from '../app/js/data.js';

test('пары, которые путают на самом деле', () => {
  assert.equal(glyphKind('3'), 'цифра');
  assert.equal(glyphKind('З'), 'буква');
  assert.equal(glyphKind('0'), 'цифра');
  assert.equal(glyphKind('О'), 'буква');   // кириллическая
  assert.equal(glyphKind('O'), 'буква');   // латинская
});

// Решение Кости 17 августа 2026: подписываются только З/3 и О/0/O. Остальное — шум,
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
  assert.notEqual(code(RU_LETTERS, 'О'), code(DIGITS, '0'));
});

test('пустые и странные значения не роняют подпись', () => {
  for (const v of [null, undefined, '', ' ', '..']) assert.equal(glyphKind(v), '');
  assert.equal(isAmbiguous('З'), true);
  assert.equal(isAmbiguous('А'), false);
});
