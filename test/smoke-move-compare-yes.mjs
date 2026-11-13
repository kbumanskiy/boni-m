// Новый адрес: свой прогресс есть, «Взять со старого адреса»; свежее чтение; «Вернуть как было»;
// два окна; состояния меняются местами (ТЗ-переезд.md, 7.2).
import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';
import { migrate } from '../app/js/state.js';

const snap = await snapshot();
const mk = (points) => migrate({ profile: { name: 'Вася', points }, progress: { ru: { learnedCount: 4,
  perChar: { 'Е': { correct: 3, total: 4 } } } }, history: [{ date: '2026-11-01', answers: 4, accuracyPct: 75 }] });
const mine = mk(5), mine2 = mk(7);
const rawMine = JSON.stringify(mine), rawMine2 = JSON.stringify(mine2);
const T = await boot({ url: `${NEW}#perenos=${await codeFor(snap)}`, store: { boni_m_state: rawMine }, name: 'smoke-move-compare-yes' });

// Свежее чтение: пока человек читал сравнение, «другое окно» записало новый ответ.
T.setStore('boni_m_state', rawMine2);
T.click('#mv-yes'); await T.sleep(20);
T.ok(T.store('boni_m_state') === rawMine2, 'после касания ничего не записано: основное — как записало другое окно');
T.ok(T.store('boni_m_state_before_move') === null && T.store('boni_m_import_at') === null, 'ни слота, ни метки');
T.ok(T.restarts === 0, 'перезапуска нет');
T.ok(T.text().includes('Здесь только что занимались — проверьте ещё раз.'), 'сказано «только что занимались»');
T.ok(T.$('#mv-confirm') && T.$$('tr.mv-cmp').length === 4, 'сравнение перерисовано (таблица, четыре строки)');
// Второе касание: в список прежних версий попало именно «прежнее + 1 ответ».
T.click('#mv-yes'); await T.sleep(20);
T.eq(T.saved(), snap, '«Взять»: boni_m_state = снимок');
const slot = JSON.parse(T.store('boni_m_state_before_move'));
T.ok(slot.length === 1 && slot[0].state === rawMine2, 'первый элемент списка — прежнее (с последним ответом)');
T.ok(/^\d{4}-\d{2}-\d{2}$/.test(slot[0].at), 'у элемента есть дата');
T.ok(T.restarts === 1, 'перезапуск вызван один раз');
const markAfterTake = T.store('boni_m_import_at');

// «Вернуть как было» — в настройках.
T.click('[data-tab="cabinet"]'); await T.sleep(10);
T.click('#tosettings'); await T.sleep(10);
T.ok(T.$('#m-undo') && T.$('#m-undo').textContent.includes('Вернуть как было'), 'в «Резервной копии» есть «Вернуть как было»');
T.click('#m-undo'); await T.sleep(10);
T.ok(T.$$('.mv-ver').length === 1 && T.$('.mv-ver').textContent.includes('Вася') && T.$('.mv-ver').textContent.includes('букв 4 из 32'), 'список: дата, имя, число букв');
T.click('[data-vrestore="0"]'); await T.sleep(10);
T.ok(T.text().includes('Вернуть прогресс от') && T.text().includes('Нынешний тоже сохранится в этом списке'), 'подтверждение на странице');
T.ok(T.$('#mv-vyes').textContent === 'Да, вернуть' && T.$('#mv-vno').textContent === 'Отмена', 'кнопки «Да, вернуть» / «Отмена»');
// Два окна: между вопросом и «Да» основное изменилось.
const snap2 = { ...snap, profile: { ...snap.profile, points: snap.profile.points + 1 } };
T.setStore('boni_m_state', JSON.stringify(snap2));
T.click('#mv-vyes'); await T.sleep(10);
T.ok(T.store('boni_m_state') === JSON.stringify(snap2), 'при «Да, вернуть» с изменившимся основным ничего не записано');
T.ok(JSON.parse(T.store('boni_m_state_before_move')).length === 1, 'список прежний');
T.ok(T.text().includes('Здесь только что занимались'), 'список перерисован с пояснением');
T.ok(T.restarts === 1, 'перезапуска нет');
// Повтор: «снимок + 1 ответ» попал в список, основное — вернулось прежнее.
T.click('[data-vrestore="0"]'); await T.sleep(10);
T.click('#mv-vyes'); await T.sleep(10);
T.eq(T.saved(), mine2, 'состояния поменялись местами: основное — прежнее из списка');
const slot2 = JSON.parse(T.store('boni_m_state_before_move'));
T.ok(slot2.length === 2 && slot2[0].state === JSON.stringify(snap2) && slot2[1].state === rawMine2, 'список [снимок+1, прежнее]: ничего не потеряно, выбранное осталось');
T.ok(T.restarts === 2 && T.store('boni_m_import_at') !== markAfterTake, 'метка обновлена, перезапуск вызван');

// «Удалить»: только с подтверждением на странице.
T.click('[data-tab="home"]'); await T.sleep(10);
T.click('[data-tab="cabinet"]'); await T.sleep(10);
T.click('#tosettings'); await T.sleep(10);
T.click('#m-undo'); await T.sleep(10);
T.ok(T.$$('.mv-ver').length === 2, 'в списке две версии');
T.click('[data-vdel="1"]'); await T.sleep(10);
T.ok(T.text().includes('Удалить прогресс от') && T.text().includes('Его нельзя будет вернуть'), 'вопрос про удаление на странице');
T.ok(JSON.parse(T.store('boni_m_state_before_move')).length === 2, 'пока человек не ответил, ничего не удалено');
T.click('#mv-vno'); await T.sleep(10);
T.ok(JSON.parse(T.store('boni_m_state_before_move')).length === 2 && T.$$('.mv-ver').length === 2, '«Отмена» — список цел');
T.click('[data-vdel="1"]'); await T.sleep(10);
T.click('#mv-vyes'); await T.sleep(10);
const left = JSON.parse(T.store('boni_m_state_before_move'));
T.ok(left.length === 1 && left[0].state === JSON.stringify(snap2), '«Да, удалить» убирает ровно одну версию');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
T.finish();
