// Нечитаемый список прежних версий не должен останавливать приём (решение 12.11.2026):
// мусор переезжает в аварийный слот байт в байт, перенос проходит, список начат заново.
import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';
import { migrate } from '../app/js/state.js';

const JUNK = 'мусор {не json ]';
const snap = await snapshot();
const mine = migrate({ profile: { name: 'Вася', points: 5 }, progress: { ru: { learnedCount: 4,
  perChar: { 'Е': { correct: 3, total: 4 } } } } });
const rawMine = JSON.stringify(mine);

const T = await boot({
  url: `${NEW}#perenos=${await codeFor(snap)}`, name: 'smoke-move-junk-list',
  store: { boni_m_state: rawMine, boni_m_state_before_move: JUNK },
});
T.ok(T.text().includes('Здесь уже есть прогресс'), 'сравнение показано');
T.click('#mv-yes'); await T.sleep(30);
const keys = [];
for (let i = 0; i < T.window.localStorage.length; i++) {
  const k = T.window.localStorage.key(i);
  if (k.startsWith('boni_m_state_before_move_broken_')) keys.push(k);
}
T.ok(keys.length === 1 && T.store(keys[0]) === JUNK, 'мусор лежит в аварийном слоте байт в байт');
const slot = JSON.parse(T.store('boni_m_state_before_move'));
T.ok(slot.length === 1 && slot[0].state === rawMine, 'список начат заново: в нём прежнее');
T.ok(T.store('boni_m_state') !== rawMine, 'основное заменено');
T.ok(!T.text().includes('Не получилось сохранить'), 'ошибки записи нет');
T.ok(T.restarts === 1, 'перенос завершён (перезапуск вызван)');
T.finish();
