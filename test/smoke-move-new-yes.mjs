// Новый адрес, пусто, ветка «Да, перенести» (ТЗ-переезд.md, 7.2).
import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const T = await boot({ url: `${NEW}#perenos=${await codeFor(snap)}`, name: 'smoke-move-new-yes' });

T.ok(T.$('#mv-yes').textContent === 'Да, перенести', 'кнопка называется «Да, перенести»');
T.click('#mv-yes'); await T.sleep(20);
T.eq(T.saved(), snap, 'после «Да» boni_m_state равен принятому состоянию');
T.ok(T.store('boni_m_state_before_move') === null, 'слота нет: прежнего не было');
T.ok(T.restarts === 1, 'перезапуск вызван один раз');
T.ok(T.store('boni_m_import_at'), 'метка приёма записана');
T.ok(T.window.sessionStorage.getItem('boni_m_moved_ok') === '1', 'в sessionStorage только флаг «1»');
T.ok(T.window.sessionStorage.length === 1, 'в sessionStorage больше ничего нет');
T.ok(T.window.location.hash === '', 'адрес чистый');
// Окно после записи ничего не пишет поверх принятого (перезапуск здесь только подсчитан).
T.$('#tabs button[data-tab="learn"]').click();
await T.sleep(50);
T.eq(T.saved(), snap, 'устаревшее состояние окна не легло поверх принятого');
// Метка собственная: возврат из фона второй перезапуск не вызывает.
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
document.dispatchEvent(new T.window.Event('visibilitychange'));
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
document.dispatchEvent(new T.window.Event('visibilitychange'));
await T.sleep(20);
T.ok(T.restarts === 1, 'свой же перезапуск по метке второй раз не вызывается');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
T.ok(!T.consoleSeen.some((l) => l.includes('M73' + '.')), 'код переноса в консоль не попал');
T.finish();
