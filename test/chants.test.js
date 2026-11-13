// Сценарии прогресса: наборы напевов (settings.chantSet, morse-v29; РЕШЕНИЯ.md, 13.11.2026).
//
// Правило Кости: любая правка состояния — отдельный раздел сценариев и тест на каждый.
// Что меняется: в настройках вместо тумблера «Напевы букв» (showChants) — три положения
// chantSet: 'classic' («Обычные») | 'alt' («Другие слова») | 'off' («Выключены»).
// showChants остаётся и всегда равен chantSet !== 'off' — его читает старый код.
// Прогресс (освоено, очки, вехи, журнал) поле не трогает ни в одном сценарии.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../app/js/state.js';
import * as V25 from '../fixtures/v25/state.js';
import * as V27 from '../fixtures/v27/state.js';
import * as M from '../app/js/move.js';
import { v25State, PAPA_OLD_STATE } from './fixtures-state.mjs';

const json = (x) => JSON.parse(JSON.stringify(x));
const noSet = (x) => { const c = structuredClone(x); delete c.settings.chantSet; return c; };
function mapStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
// Состояние v27 с телефона: пропущено через migrate настоящего кода v27 (fixtures/v27).
const v27State = (showChants) => V27.migrate({ ...json(PAPA_OLD_STATE),
  settings: { ...PAPA_OLD_STATE.settings, showChants } });
// Новое состояние с выбранным набором — как его записывает экран настроек.
const withSet = (base, set) => {
  const s = S.migrate(json(base));
  s.settings.chantSet = set; s.settings.showChants = set !== 'off';
  return s;
};

// 1. Чистая установка.
test('сценарий 1. чистая установка: «Обычные», напевы включены', () => {
  const d = S.defaultState();
  assert.equal(d.settings.chantSet, 'classic');
  assert.equal(d.settings.showChants, true);
  const s = S.load(mapStore());
  assert.equal(s.settings.chantSet, 'classic');
  assert.equal(S.migrate({}).settings.chantSet, 'classic');
});

// 2–3. Старое состояние без поля chantSet (прежние сборки, телефон папы).
test('сценарий 2. старое состояние, напевы включены → «Обычные», прогресс цел', () => {
  const s = S.migrate(json(PAPA_OLD_STATE));
  assert.equal(s.settings.chantSet, 'classic');
  assert.equal(s.settings.showChants, true);
  assert.equal(s.progress.ru.learnedCount, 20);
  assert.equal(s.profile.points, 148);
  assert.deepEqual(noSet(s), V27.migrate(json(PAPA_OLD_STATE)), 'кроме нового поля — как у v27');
});

test('сценарий 3. старое состояние, напевы выключены → «Выключены»', () => {
  const raw = { ...json(PAPA_OLD_STATE), settings: { ...PAPA_OLD_STATE.settings, showChants: false } };
  const s = S.migrate(raw);
  assert.equal(s.settings.chantSet, 'off');
  assert.equal(s.settings.showChants, false);
  assert.deepEqual(noSet(s), V27.migrate(json(raw)));
});

// 4. Состояние v25 (снято настоящим кодом v25): в снимке напевы выключены; и вариант с включёнными.
test('сценарий 4. обновление с v25: выкл → «Выключены», вкл → «Обычные», остальное как было', () => {
  const off = v25State('2026-10-17');
  assert.equal(off.settings.showChants, false, 'снимок действительно с выключенными напевами');
  const s = S.migrate(json(off));
  assert.equal(s.settings.chantSet, 'off');
  assert.equal(s.profile.points, 412);
  assert.equal(s.progress.ru.learnedCount, 27);
  const on = { ...json(off), settings: { ...off.settings, showChants: true } };
  assert.equal(S.migrate(V25.migrate(on)).settings.chantSet, 'classic');
});

// 5. Состояние v27 (последняя выложенная версия).
test('сценарий 5. обновление с v27: вкл → «Обычные», выкл → «Выключены», остальное как было', () => {
  for (const [on, want] of [[true, 'classic'], [false, 'off']]) {
    const old = v27State(on);
    assert.equal(old.settings.chantSet, undefined, 'у v27 поля нет');
    const s = S.migrate(json(old));
    assert.equal(s.settings.chantSet, want);
    assert.equal(s.settings.showChants, on);
    assert.deepEqual(noSet(s), old, 'всё прочее — побайтно как у v27');
  }
});

// 6. Новое состояние: выбор доживает до следующего запуска; миграция идемпотентна.
test('сценарий 6. выбор набора сохраняется и переживает перезапуск', () => {
  for (const set of ['classic', 'alt', 'off']) {
    const store = mapStore();
    const s = withSet(PAPA_OLD_STATE, set);
    assert.equal(S.save(s, store), true);
    const back = S.load(store);
    assert.equal(back.settings.chantSet, set);
    assert.equal(back.settings.showChants, set !== 'off');
    assert.deepEqual(back, s);
    assert.deepEqual(S.migrate(json(back)), back, 'идемпотентно');
  }
});

// 7. Откат на v27 и на v25: новое поле старым кодом игнорируется, вкл/выкл он видит в showChants.
test('сценарий 7. откат на v27: не падает, «Выключены» остаются выключенными, прочее цело', () => {
  for (const set of ['classic', 'alt', 'off']) {
    const s = withSet(v25State('2026-10-17'), set);
    let old;
    assert.doesNotThrow(() => { old = V27.migrate(json(s)); });
    assert.equal(old.settings.showChants, set !== 'off', `${set}: v27 видит вкл/выкл`);
    assert.equal(old.settings.chantSet, undefined, 'v27 поле не знает и не хранит');
    assert.deepEqual(old, noSet(s), `${set}: кроме набора всё как было`);
  }
});

test('сценарий 7. откат на v25: не падает, вкл/выкл сохраняется, прогресс цел', () => {
  for (const set of ['classic', 'alt', 'off']) {
    const s = withSet(v25State('2026-10-17'), set);
    let old;
    assert.doesNotThrow(() => { old = V25.migrate(json(s)); });
    assert.equal(old.settings.showChants, set !== 'off');
    assert.equal(old.profile.points, 412);
    assert.equal(old.progress.ru.learnedCount, 27);
    assert.deepEqual(old.milestones, s.milestones);
  }
});

// 8. Повторное обновление после отката: «Другие слова» становятся «Обычными» (старый код
// поле не сохранил) — безвредно; «Выключены» остаются выключенными.
test('сценарий 8. полный цикл: новый сохранил → v27 загрузил и сохранил → новый загрузил', () => {
  for (const [set, after] of [['classic', 'classic'], ['alt', 'classic'], ['off', 'off']]) {
    const store = mapStore();
    const s = withSet(PAPA_OLD_STATE, set);
    S.save(s, store);
    V27.save(V27.load(store), store);
    const back = S.load(store);
    assert.equal(back.settings.chantSet, after, `${set} → ${after}`);
    assert.deepEqual(noSet(back), noSet(s), `${set}: прочее без потерь`);
  }
});

// 9. Смешанный кэш: старый app.js знает только тумблер showChants и мог переключить его,
// оставив chantSet прежним. Главный — showChants.
test('сценарий 9. смешанный кэш: showChants главнее устаревшего chantSet', () => {
  const m = (showChants, chantSet) => S.migrate({ settings: { showChants, chantSet } }).settings;
  assert.equal(m(true, 'off').chantSet, 'classic', 'старый код включил напевы — «Обычные»');
  assert.equal(m(false, 'alt').chantSet, 'off', 'старый код выключил — «Выключены»');
  assert.equal(m(true, 'alt').chantSet, 'alt');
  assert.equal(m(undefined, 'alt').chantSet, 'alt', 'нет тумблера — как включено');
});

// 10. Мусор в поле (подсунутый файл копии) — не ломает и не протаскивает чужие значения.
test('сценарий 10. мусор в chantSet → «Обычные» (или «Выключены» при выключенном тумблере)', () => {
  for (const v of ['english', '', 7, null, true, { a: 1 }, ['alt'], '<b>']) {
    assert.equal(S.migrate({ settings: { chantSet: v } }).settings.chantSet, 'classic', String(v));
    assert.equal(S.migrate({ settings: { chantSet: v, showChants: false } }).settings.chantSet, 'off', String(v));
  }
});

// 11. Резервная копия и перенос: выбор набора едет вместе с прогрессом.
test('сценарий 11. резервная копия и код переноса сохраняют набор', async () => {
  for (const set of ['alt', 'off']) {
    const s = withSet(v25State('2026-10-17'), set);
    const rd = S.readIncoming(S.exportText(s));
    assert.equal(rd.ok, true);
    assert.equal(rd.state.settings.chantSet, set, `копия: ${set}`);
    const code = await M.encodeTransfer(S.exportText(s), { date: '20261113' });
    const rd2 = S.readIncoming((await M.decodeTransfer(code)).json);
    assert.equal(rd2.state.settings.chantSet, set, `перенос: ${set}`);
    assert.deepEqual(rd2.state, s);
  }
});

// 12. Копия, сделанная старой версией (без chantSet), восстанавливается в новой как раньше.
test('сценарий 12. копия от v27 восстанавливается: набор по тумблеру', () => {
  for (const [on, want] of [[true, 'classic'], [false, 'off']]) {
    const rd = S.readIncoming(JSON.stringify(v27State(on)));
    assert.equal(rd.ok, true);
    assert.equal(rd.state.settings.chantSet, want);
  }
});
