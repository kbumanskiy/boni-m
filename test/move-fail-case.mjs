// Отказ записи на каждом шаге приёма — в НАСТОЯЩЕМ обработчике (ТЗ-переезд.md, 7.2).
// Случай задаётся переменной MOVE_FAIL: list | verify | mark | save.
// Везде: основное на диске прежнее (или прежнее + его копия в списке), текст ошибки записи
// на экране, «Готово» нет, перезапуск не вызван.
// node --test заходит и в этот файл напрямую (он лежит в test/): без заданного случая делать нечего.
if (!process.env.MOVE_FAIL) process.exit(0);

import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';
import { migrate } from '../app/js/state.js';

const CASE = process.env.MOVE_FAIL;
const snap = await snapshot();
const mine = migrate({ profile: { name: 'Вася', points: 5 }, progress: { ru: { learnedCount: 4,
  perChar: { 'Е': { correct: 3, total: 4 } } } } });
const rawMine = JSON.stringify(mine);
const KEY = { list: 'boni_m_state_before_move', verify: 'boni_m_state_before_move', mark: 'boni_m_import_at', save: 'boni_m_state' }[CASE];

const T = await boot({
  url: `${NEW}#perenos=${await codeFor(snap)}`, store: { boni_m_state: rawMine }, name: `smoke-move-fail-${CASE}`,
  // Хранилище-обёртка: JSDOM-овский Storage подменой методов не ломается (записал бы ключ «setItem»).
  beforeImport: ({ window }) => {
    const real = window.localStorage;
    const wrap = {
      getItem: (k) => real.getItem(k),
      removeItem: (k) => real.removeItem(k),
      setItem: (k, v) => {
        if (k === KEY) {
          if (CASE === 'verify') { real.setItem(k, 'испорчено при записи'); return; }
          throw new Error('QuotaExceededError');
        }
        real.setItem(k, v);
      },
      key: (i) => real.key(i), get length() { return real.length; },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: wrap, configurable: true, writable: true });
  },
});

T.ok(T.text().includes('Здесь уже есть прогресс'), 'сравнение показано');
T.click('#mv-yes'); await T.sleep(30);
const slot = T.store('boni_m_state_before_move');
if (CASE === 'save') {
  T.ok(T.store('boni_m_state') === rawMine, 'отказ записи основного: основное прежнее');
  T.ok(slot && JSON.parse(slot).length === 1 && JSON.parse(slot)[0].state === rawMine, 'в списке — копия прежнего (безвредно)');
} else if (CASE === 'verify') {
  T.ok(T.store('boni_m_state') === rawMine, 'обратное чтение не совпало: основное не тронуто');
  T.ok(T.store('boni_m_import_at') === null, 'метка не записана');
} else {
  T.ok(T.store('boni_m_state') === rawMine, 'отказ записи: основное не тронуто');
  if (CASE === 'list') T.ok(slot === null, 'списка нет');
  if (CASE === 'mark') T.ok(T.store('boni_m_import_at') === null, 'метка не записана');
}
T.ok(T.$('#mv-msg') && T.text().includes('Не получилось сохранить в этом браузере'), 'на экране текст ошибки записи');
T.ok(T.text().includes('Прогресс на старом адресе цел'), 'сказано, что на старом адресе всё цело');
T.ok(!T.text().includes('Готово'), '«Готово» нет');
T.ok(T.restarts === 0, 'перезапуск не вызван');
T.ok(T.window.sessionStorage.getItem('boni_m_moved_ok') === null, 'флаг «Готово» не записан');
// «Продолжить» → обычный старт со своим прогрессом.
T.click('#mv-b0'); await T.sleep(30);
T.ok(T.text().includes('Вася'), '«Продолжить» → главная со своим прогрессом');
T.finish();
