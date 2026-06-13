// Свободный набор на «Ключе»: правило «между символами максимум один пробел».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLine, addChar, addSpace, eraseLast, clearLine } from '../app/js/keytext.js';

test('строка строится из букв', () => {
  let l = emptyLine();
  for (const c of 'МИР') l = addChar(l, c);
  assert.equal(l.text, 'МИР');
});

test('ведущего пробела не бывает (пробел до первой буквы игнорируется)', () => {
  let l = emptyLine();
  l = addSpace(l);
  assert.equal(l.text, '');
});

test('между словами ровно один пробел, второй не добавляется', () => {
  let l = emptyLine();
  for (const c of 'МИР') l = addChar(l, c);
  l = addSpace(l);
  assert.equal(l.text, 'МИР ');
  l = addSpace(l); // повторная длинная пауза — НЕ должна добавить второй пробел
  l = addSpace(l);
  assert.equal(l.text, 'МИР ', 'максимум один пробел между символами');
});

test('после пробела новая буква разрешает следующий одиночный пробел', () => {
  let l = emptyLine();
  for (const c of 'ПРИВЕТ') l = addChar(l, c);
  l = addSpace(l);
  for (const c of 'МИР') l = addChar(l, c);
  l = addSpace(l);
  assert.equal(l.text, 'ПРИВЕТ МИР ');
  l = addSpace(l);
  assert.equal(l.text, 'ПРИВЕТ МИР ', 'и снова только один пробел');
});

test('стирание убирает последний знак и корректно отслеживает пробел', () => {
  let l = emptyLine();
  for (const c of 'ДА') l = addChar(l, c);
  l = addSpace(l);            // 'ДА '
  l = eraseLast(l);           // 'ДА'  — пробел стёрт
  assert.equal(l.text, 'ДА');
  assert.equal(l.spaced, false, 'после стирания пробела снова можно поставить пробел');
  l = addSpace(l);
  assert.equal(l.text, 'ДА ');
  l = eraseLast(l);           // 'ДА'
  l = eraseLast(l);           // 'Д'
  assert.equal(l.text, 'Д');
});

test('очистка обнуляет строку и не даёт ведущего пробела', () => {
  let l = emptyLine();
  for (const c of 'ТЕСТ') l = addChar(l, c);
  l = clearLine();
  assert.equal(l.text, '');
  l = addSpace(l);
  assert.equal(l.text, '', 'после очистки пробел в начало не ставится');
});
