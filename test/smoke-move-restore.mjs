// «Восстановить из копии» на странице, а не окнами; на СТАРОМ адресе прежнее не пропадает (ТЗ-переезд.md, 12.2).
import { boot, OLD, snapshot } from './move-harness.mjs';
import { migrate } from '../app/js/state.js';

const snap = await snapshot();
const mine = migrate({ profile: { name: 'Вася', points: 5 }, progress: { ru: { learnedCount: 4, perChar: { 'Е': { correct: 3, total: 4 } } } } });
const rawMine = JSON.stringify(mine);
const T = await boot({ url: OLD, store: { boni_m_state: rawMine }, name: 'smoke-move-restore' });
// Обычный старт дописывает тихие вехи — «прежнее» это то, что лежит в хранилище после старта.
const rawBase = T.store('boni_m_state');
const pick = async (text) => {
  const input = T.$('#file');
  const file = new T.window.File([text], 'копия.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  T.fire(input, 'change');
  await T.sleep(60);
};
T.click('#gear'); await T.sleep(20);

// Не наша копия: сегодня «{}» молча обнуляло человека.
await pick('{}');
T.ok(T.$('#m-note').textContent === 'В этом файле нет прогресса «Школы Морзе 73».', '«{}» → «нет прогресса», ничего не записано');
T.ok(T.store('boni_m_state') === rawBase && T.store('boni_m_state_before_move') === null, 'хранилище не тронуто');
await pick('это не json');
T.ok(T.$('#m-note').textContent.includes('нет прогресса'), 'не json → то же пояснение на странице');
T.ok(T.dialogs.length === 0, 'ни confirm, ни alert');

// Настоящая копия, свой прогресс есть → сравнение; «Оставить как здесь» → обратно в настройки.
await pick(JSON.stringify(snap, null, 2));
T.ok(T.$('#mv-confirm') && T.text().includes('Здесь уже есть прогресс') && T.text().includes('из копии: Бонислав'), 'сравнение «из копии» / «здесь»');
T.click('#mv-no'); await T.sleep(20);
T.ok(T.text().includes('Резервная копия') && T.store('boni_m_state') === rawBase, '«Оставить как здесь» → настройки, прогресс прежний');
// «Взять из копии».
await pick(JSON.stringify(snap, null, 2));
T.ok(T.$('#mv-yes').textContent === 'Взять из копии', 'кнопка «Взять из копии»');
T.click('#mv-yes'); await T.sleep(20);
T.eq(T.saved(), snap, 'принято состояние из копии');
const slot = JSON.parse(T.store('boni_m_state_before_move'));
T.ok(slot.length === 1 && slot[0].state === rawBase, 'прежнее на старом адресе лежит в списке');
T.ok(T.restarts === 1, 'перезапуск один раз');
T.ok(T.window.sessionStorage.getItem('boni_m_moved_ok') === null, 'карточка «Готово» после файла не заказывается');
// Вернуть как было — на старом адресе.
T.click('[data-tab="cabinet"]'); await T.sleep(10);
T.click('#tosettings'); await T.sleep(10);
T.ok(T.$('#m-undo'), 'на старом адресе «Вернуть как было» есть');
T.finish();
