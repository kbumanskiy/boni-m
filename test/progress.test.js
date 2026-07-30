// Тесты методики Коха (ТЗ §6, §6.1, §7.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../app/js/state.js';
import {
  activeSet, newestChar, recordAnswer, shouldOpenNext, openNext,
  shouldOfferPark, parkNewest, combinedOrder, openedCount,
  pickTarget, pickFirstTarget, buildOptions, ensureStarted,
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
  // Много верных ответов, но новейший (М) ответим лишь 5 раз → условие «новейший ≥6» не выполнено.
  for (let i = 0; i < 25; i++) recordAnswer(t, 'Е', true);
  for (let i = 0; i < 5; i++) recordAnswer(t, 'М', true);
  assert.equal(shouldOpenNext(t, 'ru'), false, 'новейший отвечен <6 раз');
});

test('правило §6: открывается, когда точность ≥85% и новейший ≥6 при ≥80%', () => {
  const t = freshTrack();
  for (let i = 0; i < 14; i++) recordAnswer(t, 'Е', true);
  for (let i = 0; i < 6; i++) recordAnswer(t, 'М', true); // новейший: ровно 6 раз, 100%
  assert.equal(shouldOpenNext(t, 'ru'), true, 'порог снижён: 6 ответов на новейший достаточно');
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

test('§7.2: на большом наборе — ровно 6 кнопок, обязательно цель и новейший', () => {
  const active = ['Е','Т','И','М','А','Н','С','О','У','К','Р','В']; // 12
  // Число кнопок постоянное: от него зависит высота экрана, а занятие обязано
  // помещаться без прокрутки.
  for (const seed of [7, 13, 21, 34, 55]) {
    const opts = buildOptions(active, 'С', 'В', seeded(seed));
    assert.equal(opts.length, 6, `кнопок ${opts.length} при семени ${seed}`);
    assert.ok(opts.includes('С'), 'цель присутствует');
    assert.ok(opts.includes('В'), 'новейший присутствует');
    assert.equal(new Set(opts).size, opts.length, 'без дублей');
  }
});

test('§7.2: набор ровно из 6 знаков показывается целиком', () => {
  const active = ['Е', 'Т', 'И', 'М', 'А', 'Н'];
  const opts = buildOptions(active, 'А', 'Н', seeded(9));
  assert.deepEqual(new Set(opts), new Set(active));
});

test('§7.2: один знак не бывает целью более 2 раз подряд', () => {
  const rng = seeded(3);
  const active = ['Е', 'Т', 'И', 'М'];
  const target = pickTarget(active, ['М', 'М'], 'М', rng);
  assert.notEqual(target, 'М', 'после двух М подряд третий раз М не выбирается');
});

// ——— Разнообразие знаков. Жалоба: «маршрут всегда начинается с одной и той же буквы». ———

test('первый знак занятия выбирается равномерно, без уклона к новейшему', () => {
  const active = ['Е', 'Т', 'И', 'М'];
  const rng = seeded(11);
  const cnt = {};
  for (let i = 0; i < 8000; i++) {
    const c = pickFirstTarget(active, null, rng);
    cnt[c] = (cnt[c] || 0) + 1;
  }
  for (const c of active) {
    const share = cnt[c] / 8000;
    assert.ok(Math.abs(share - 0.25) < 0.03, `${c}: доля ${(share * 100).toFixed(1)}% вместо ~25%`);
  }
});

test('первый знак занятия не повторяет тот, с которого начали в прошлый раз', () => {
  const active = ['Е', 'Т', 'И', 'М'];
  const rng = seeded(5);
  for (let i = 0; i < 500; i++) {
    assert.notEqual(pickFirstTarget(active, 'М', rng), 'М');
  }
  // Вырожденный случай: набор из одного знака — начинаем с него, а не падаем.
  assert.equal(pickFirstTarget(['Е'], 'Е', rng), 'Е');
});

// Считает фактические доли выпадений целей на длинном прогоне.
function targetShares(active, newest, seed, rounds = 12000) {
  const rng = seeded(seed);
  const cnt = {};
  const recent = [];
  for (let i = 0; i < rounds; i++) {
    const c = pickTarget(active, recent, newest, rng);
    recent.push(c);
    cnt[c] = (cnt[c] || 0) + 1;
  }
  const shares = {};
  for (const c of active) shares[c] = (cnt[c] || 0) / rounds;
  return shares;
}

test('на стартовом наборе новейший знак заметно чаще прочих, но не половина раундов', () => {
  const active = ['Е', 'Т', 'И', 'М'];
  const shares = targetShares(active, 'М', 23);
  const newest = shares['М'];
  assert.ok(newest > 0.27 && newest < 0.33,
    `доля новейшего ${(newest * 100).toFixed(1)}% — должна быть около 30% (было 50%)`);
  for (const c of ['Е', 'Т', 'И']) {
    assert.ok(shares[c] > 0.18, `${c} выпадает лишь ${(shares[c] * 100).toFixed(1)}% — слишком редко`);
    assert.ok(shares[c] < newest, `${c} выпадает не реже новейшего`);
  }
});

test('на большом наборе уклон к новейшему слабеет — старые знаки не выпадают из повторения', () => {
  const active = ['Е','Т','И','М','А','Н','С','О','У','К','Р','В']; // 12 знаков
  const shares = targetShares(active, 'В', 29);
  const newest = shares['В'];
  const others = active.filter((c) => c !== 'В').map((c) => shares[c]);
  assert.ok(newest > 0.15 && newest < 0.26,
    `доля новейшего на 12 знаках ${(newest * 100).toFixed(1)}% — должна быть около 21%`);
  assert.ok(Math.min(...others) > 0.04, 'каждый старый знак продолжает выпадать');
  assert.ok(newest > Math.max(...others), 'новейший всё равно самый частый');
});

test('одна и та же цель не идёт два раза подряд, пока есть из чего выбрать', () => {
  const active = ['Е', 'Т', 'И', 'М'];
  const rng = seeded(31);
  const recent = [];
  for (let i = 0; i < 3000; i++) recent.push(pickTarget(active, recent, 'М', rng));
  for (let i = 1; i < recent.length; i++) {
    assert.notEqual(recent[i], recent[i - 1], `повтор подряд на позиции ${i}: ${recent[i]}`);
  }
});
