// Тесты методики Коха (ТЗ §6, §6.1, §7.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../app/js/state.js';
import {
  activeSet, newestChar, recordAnswer, shouldOpenNext, openNext,
  shouldOfferPark, parkNewest, combinedOrder, openedCount,
  pickTarget, buildOptions, ensureStarted,
} from '../app/js/progress.js';

function freshTrack() {
  return defaultState().progress.ru;
}
// Детерминированный ГПСЧ для воспроизводимых тестов.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('старт: активный набор — первые 4 знака русского порядка', () => {
  const t = freshTrack();
  assert.deepEqual(activeSet(t, 'ru'), ['Е', 'Т', 'И', 'М']);
  assert.equal(newestChar(t, 'ru'), 'М');
  assert.equal(t.learnedCount, 4);
});

test('правило §6: новый знак НЕ открывается, пока не выполнены оба условия', () => {
  const t = freshTrack();
  // Пустой recent — не открывать.
  assert.equal(shouldOpenNext(t, 'ru'), false);
  // Дадим 30 верных ответов, но новейший (М) ответим лишь 5 раз → условие 2 не выполнено.
  for (let i = 0; i < 25; i++) recordAnswer(t, 'Е', true);
  for (let i = 0; i < 5; i++) recordAnswer(t, 'М', true);
  assert.equal(shouldOpenNext(t, 'ru'), false, 'новейший отвечен <10 раз');
});

test('правило §6: открывается, когда точность ≥90% и новейший ≥10 при ≥85%', () => {
  const t = freshTrack();
  for (let i = 0; i < 18; i++) recordAnswer(t, 'Е', true);
  for (let i = 0; i < 12; i++) recordAnswer(t, 'М', true); // новейший: 12 раз, 100%
  assert.equal(shouldOpenNext(t, 'ru'), true);
  const opened = openNext(t, 'ru');
  assert.equal(opened, 'А', 'пятый знак русского порядка — А');
  assert.equal(t.learnedCount, 5);
  assert.equal(newestChar(t, 'ru'), 'А');
});

test('правило §6: низкая общая точность держит набор закрытым', () => {
  const t = freshTrack();
  for (let i = 0; i < 15; i++) recordAnswer(t, 'М', true);
  for (let i = 0; i < 15; i++) recordAnswer(t, 'М', false); // 50% общая
  assert.equal(shouldOpenNext(t, 'ru'), false);
});

test('§6.1: буксующий знак (≥20 попыток, <70%) предлагается отложить', () => {
  const t = freshTrack();
  // М: 20 попыток, 50% → должно предложить отложить.
  for (let i = 0; i < 10; i++) { recordAnswer(t, 'М', true); recordAnswer(t, 'М', false); }
  assert.equal(shouldOfferPark(t, 'ru'), true);
  const res = parkNewest(t, 'ru');
  assert.equal(res.parked, 'М');
  assert.equal(res.opened, 'А', 'открылся следующий знак');
  assert.ok(!activeSet(t, 'ru').includes('М'), 'отложенный убран из ротации');
  assert.equal(t.parked.length, 1);
});

test('§6.1: одновременно отложенных не больше двух', () => {
  const t = freshTrack();
  t.parked = [{ char: 'Х', returnAt: 999 }, { char: 'Ж', returnAt: 999 }];
  for (let i = 0; i < 20; i++) recordAnswer(t, 'М', false);
  assert.equal(shouldOfferPark(t, 'ru'), false);
});

test('§6.1: отложенный знак возвращается в ротацию позже', () => {
  const t = freshTrack();
  for (let i = 0; i < 20; i++) recordAnswer(t, 'М', false);
  parkNewest(t, 'ru'); // М отложен, returnAt = openedCount+3
  // откроем ещё знаки, пока не наступит срок возврата
  while (openedCount(t) < t.parked[0]?.returnAt) openNext(t, 'ru');
  assert.ok(activeSet(t, 'ru').includes('М'), 'М вернулся в активный набор');
  assert.equal(t.parked.length, 0);
});

test('§6: цифры подмешиваются после 20 букв', () => {
  const order = combinedOrder('ru');
  assert.equal(order.slice(0, 20).every((c) => !/[0-9]/.test(c)), true, 'первые 20 — буквы');
  assert.equal(order[21], '0', 'первая цифра — 0 — появляется после ~20 букв');
  // Открыть 21 букву, затем следующий знак — цифра.
  const t = freshTrack();
  t.learnedCount = 21;
  assert.equal(newestChar(t, 'ru'), 'Ы');
  const opened = openNext(t, 'ru');
  assert.equal(opened, '0');
  assert.equal(t.digitsLearned, 1);
  assert.ok(activeSet(t, 'ru').includes('0'));
});

test('combinedOrder содержит все 32 буквы и 10 цифр без повторов', () => {
  const order = combinedOrder('ru');
  assert.equal(order.length, 42);
  assert.equal(new Set(order).size, 42);
});

test('§7.2: при наборе ≤8 показываются все знаки (≥4 кнопок)', () => {
  const rng = seeded(1);
  const active = ['Е', 'Т', 'И', 'М'];
  const opts = buildOptions(active, 'М', 'М', rng);
  assert.equal(opts.length, 4);
  assert.deepEqual(new Set(opts), new Set(active));
});

test('§7.2: при наборе >8 — 6–8 кнопок, обязательно цель и новейший', () => {
  const rng = seeded(7);
  const active = ['Е','Т','И','М','А','Н','С','О','У','К','Р','В']; // 12
  const opts = buildOptions(active, 'С', 'В', rng);
  assert.ok(opts.length >= 6 && opts.length <= 8, `кнопок ${opts.length}`);
  assert.ok(opts.includes('С'), 'цель присутствует');
  assert.ok(opts.includes('В'), 'новейший присутствует');
  assert.equal(new Set(opts).size, opts.length, 'без дублей');
});

test('§7.2: один знак не бывает целью более 2 раз подряд', () => {
  const rng = seeded(3);
  const active = ['Е', 'Т', 'И', 'М'];
  const target = pickTarget(active, ['М', 'М'], 'М', rng);
  assert.notEqual(target, 'М', 'после двух М подряд третий раз М не выбирается');
});
