// Свой позывной (ТЗ §9). Повод переделки — вопрос с форума QRZ.RU 18 августа 2026:
// в упражнении «Принять свой позывной» звучал «Boney M» вместо позывного человека.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCallsign, callsignParts, callsignAvailable } from '../app/js/callsign.js';
import { CODE_BY_CHAR } from '../app/js/data.js';

const lookup = (ch) => CODE_BY_CHAR.en.get(ch) || CODE_BY_CHAR.ru.get(ch);

test('позывной приводится к виду, который можно проиграть', () => {
  assert.equal(normalizeCallsign('ra9flc'), 'RA9FLC');
  assert.equal(normalizeCallsign('  R7CL/p '), 'R7CL/P');
  assert.equal(normalizeCallsign('Boney M'), 'BONEY M', 'привычное написание сохраняем');
  assert.equal(normalizeCallsign('RA9FLC (Иркутск)'), 'RA9FLC ИРКУТ', 'скобки прочь, длина ограничена (12 знаков)');
  assert.equal(normalizeCallsign(''), '');
  assert.equal(normalizeCallsign(null), '');
});

test('знаки без кода не ломают упражнение, а просто выпадают', () => {
  const parts = callsignParts('R7CL/P', lookup);
  assert.ok(parts.every((p) => typeof p.code === 'string' && p.code.length));
  assert.deepEqual(parts.map((p) => p.ch).join(''), 'R7CLP',
    'дробной черты нет в таблице знаков — проиграть её нечем');
});

test('открытость считается по кодам, а не по буквам', () => {
  // Русский курс: человек знает Б, О, Н, Е, Ы, М — значит слышит и B, O, N, E, Y, M.
  const learned = new Set(['Б', 'О', 'Н', 'Е', 'Ы', 'М'].map(lookup));
  assert.equal(callsignAvailable('BONEY M', lookup, learned), true, 'пробел звучать не обязан');
  assert.equal(callsignAvailable('boney m', lookup, learned), true);
  assert.equal(callsignAvailable('RA9FLC', lookup, learned), false, 'этих кодов ещё не знает');
  assert.equal(callsignAvailable('', lookup, learned), false);
  assert.equal(callsignAvailable('()', lookup, learned), false, 'позывной без единого кода');
});
