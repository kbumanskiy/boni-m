// Тесты «следа сигнала»: пропорции морзянки должны быть честными, иначе он учит неверному ритму.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceParts, traceSequence, traceUnits } from '../app/js/trace.js';
import { CALLSIGN_CODES, RU_LETTERS } from '../app/js/data.js';

test('точка — одна единица, тире — три, между ними пауза в одну', () => {
  assert.deepEqual(traceParts('.'), ['dit']);
  assert.deepEqual(traceParts('-'), ['dah']);
  assert.deepEqual(traceParts('.-'), ['dit', 'g1', 'dah']);
  assert.deepEqual(traceParts('-...'), ['dah', 'g1', 'dit', 'g1', 'dit', 'g1', 'dit']);
});

test('между знаками пауза в три единицы, лишней паузы в начале нет', () => {
  assert.deepEqual(traceSequence(['.', '-']), ['dit', 'g3', 'dah']);
  assert.equal(traceSequence(['.', '-'])[0], 'dit', 'след не начинается с паузы');
  assert.deepEqual(traceSequence(['', '.']), ['dit'], 'пустой код не даёт висящей паузы');
  assert.deepEqual(traceSequence([]), []);
});

test('мусор в коде не рисуется', () => {
  assert.deepEqual(traceParts('.x-'), ['dit', 'g1', 'dah']);
  assert.deepEqual(traceParts(''), []);
});

test('длина следа в единицах считается по стандартным пропорциям', () => {
  assert.equal(traceUnits(traceParts('.')), 1);
  assert.equal(traceUnits(traceParts('-')), 3);
  assert.equal(traceUnits(traceParts('.-')), 5, 'точка + пауза + тире = 1+1+3');
  // Б = -... : 3 + (1+1)*3 = 3+1+1+1+1+1 = 9
  assert.equal(traceUnits(traceParts('-...')), 9);
});

test('позывной Boney M укладывается в ширину телефона при масштабе 5px за единицу', () => {
  const units = traceUnits(traceSequence(CALLSIGN_CODES));
  assert.equal(units, 61, `позывной занимает ${units} единиц`);
  assert.ok(units * 5 < 330, 'при 5px за единицу след уместится рядом с портретом на узком экране');
});

test('след строится для каждой буквы алфавита без пропусков', () => {
  for (const l of RU_LETTERS) {
    const parts = traceParts(l.code);
    assert.ok(parts.length > 0, `${l.char}: пустой след`);
    const sounds = parts.filter((p) => p === 'dit' || p === 'dah').length;
    assert.equal(sounds, l.code.length, `${l.char}: полосок ${sounds}, а в коде ${l.code.length} элементов`);
  }
});
