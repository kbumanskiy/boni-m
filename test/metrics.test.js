// Анонимная статистика: что уходит, когда и что НЕ уходит.
// Правило одно: наружу — номер установки, версия, минуты, дата. Больше ничего.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METRICS_KEY, QUEUE_MAX, MIN_MAX,
  newHex, emptyMeta, loadMeta, saveMeta, ensureId,
  sessionEvent, enqueue, buildPayload, dropSent, metricsOn,
} from '../app/js/metrics.js';

import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../app/js/version.js';

test('версия приложения совпадает с именем кэша в sw.js — поднимать вместе', () => {
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const m = sw.match(/const CACHE = '([^']+)'/);
  assert.equal(APP_VERSION, m && m[1]);
});

const fakeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

test('номер установки — 16 шестнадцатеричных знаков из случайных байт', () => {
  const id = newHex(8, () => new Uint8Array([0, 1, 254, 255, 16, 32, 64, 128]));
  assert.equal(id, '0001feff10204080');
  assert.match(newHex(8), /^[0-9a-f]{16}$/);
});

test('номер установки создаётся один раз и потом не меняется', () => {
  const meta = ensureId(emptyMeta());
  assert.match(meta.id, /^[0-9a-f]{16}$/);
  const again = ensureId(meta);
  assert.equal(again.id, meta.id);
});

test('meta читается и пишется в отдельный ключ, битые данные → пустая meta', () => {
  const st = fakeStorage();
  assert.deepEqual(loadMeta(st), emptyMeta());
  st.setItem(METRICS_KEY, '{нет');
  assert.deepEqual(loadMeta(st), emptyMeta());
  const meta = ensureId(emptyMeta());
  assert.equal(saveMeta(meta, st), true);
  assert.deepEqual(loadMeta(st), meta);
  assert.notEqual(METRICS_KEY, 'boni_m_state', 'статистика не лезет в состояние прогресса');
});

test('событие занятия: минуты округляются, версия и день — как есть', () => {
  const ev = sessionEvent({ start: 1000, end: 1000 + 7.4 * 60000, version: 'morse-v22', day: '2026-09-14' });
  assert.equal(ev.min, 7);
  assert.equal(ev.v, 'morse-v22');
  assert.equal(ev.day, '2026-09-14');
  assert.match(ev.k, /^[0-9a-f]{8}$/, 'у события есть ключ для склейки повторов');
});

test('событие занятия: кривое время не даёт отрицательных или бесконечных минут', () => {
  assert.equal(sessionEvent({ start: 5000, end: 1000, version: 'x', day: 'd' }).min, 0);
  assert.equal(sessionEvent({ start: 0, end: 1e12, version: 'x', day: 'd' }).min, MIN_MAX);
  assert.equal(sessionEvent({ start: NaN, end: 1000, version: 'x', day: 'd' }).min, 0);
});

test('очередь не растёт бесконечно: старые события выпадают', () => {
  let meta = emptyMeta();
  for (let i = 0; i < QUEUE_MAX + 5; i++) {
    meta = enqueue(meta, sessionEvent({ start: 0, end: i * 60000, version: 'v', day: 'd' }));
  }
  assert.equal(meta.queue.length, QUEUE_MAX);
  assert.equal(meta.queue[0].min, 5, 'выпали самые старые');
});

test('в отправке нет ничего, кроме номера, источника и событий', () => {
  let meta = ensureId(emptyMeta());
  meta = enqueue(meta, sessionEvent({ start: 0, end: 120000, version: 'v', day: '2026-09-14' }));
  const p = buildPayload(meta);
  assert.deepEqual(Object.keys(p).sort(), ['events', 'from', 'id']);
  assert.equal(p.from, 'app');
  assert.deepEqual(Object.keys(p.events[0]).sort(), ['day', 'k', 'min', 'v']);
  assert.equal(JSON.stringify(p).includes('name'), false);
});

test('пустая очередь — отправлять нечего', () => {
  assert.equal(buildPayload(ensureId(emptyMeta())), null);
});

test('после успешной отправки ушедшие события снимаются, новые остаются', () => {
  let meta = ensureId(emptyMeta());
  meta = enqueue(meta, sessionEvent({ start: 0, end: 60000, version: 'v', day: 'd' }));
  meta = enqueue(meta, sessionEvent({ start: 0, end: 60000, version: 'v', day: 'd' }));
  const sentKeys = meta.queue.map((e) => e.k);
  meta = enqueue(meta, sessionEvent({ start: 0, end: 180000, version: 'v', day: 'd' })); // пришло, пока слали
  meta = dropSent(meta, sentKeys);
  assert.equal(meta.queue.length, 1);
  assert.equal(meta.queue[0].min, 3);
});

test('выключатель: по умолчанию включено, false выключает', () => {
  assert.equal(metricsOn({}), true);
  assert.equal(metricsOn({ metrics: true }), true);
  assert.equal(metricsOn({ metrics: false }), false);
});
