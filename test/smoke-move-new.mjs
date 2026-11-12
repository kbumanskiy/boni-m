// Новый адрес, пустое хранилище, во фрагменте — снимок v25 (ТЗ-переезд.md, 7.2).
import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';
import { migrate } from '../app/js/state.js';

const snap = await snapshot();
const code = await codeFor(snap);
const T = await boot({ url: `${NEW}#perenos=${code}`, name: 'smoke-move-new' });

// До первого касания.
T.ok(T.window.location.hash === '', 'фрагмент стёрт из адресной строки');
T.ok(T.window.history.length === T.historyBefore, 'история вкладки не выросла');
T.ok(T.store('boni_m_state') === null, 'до касания в хранилище ничего нет');
T.ok(T.$('#mv-confirm') && T.text().includes('Перенести ваш прогресс?'), 'на экране «Перенести ваш прогресс?», а не знакомство');
T.ok(!T.text().includes('Как вас зовут'), 'знакомство не открылось');
T.ok(T.text().includes('снято 18 октября'), 'дата снимка на экране');
for (const s of ['Бонислав', '27 из 32', '6 из 10', '300 мин', '412', '17 октября']) T.ok(T.text().includes(s), `сводка: «${s}»`);
T.ok(T.text().includes('закройте их'), 'строка про другие окна');
T.ok(document.activeElement !== T.$('#mv-yes') && document.activeElement !== T.$('#mv-no'), 'ни одна кнопка не в фокусе');
T.ok(T.$('#tabs').classList.contains('hidden'), 'нижнее меню спрятано');
T.ok(T.store('boni_m_state_before_move') === null && T.store('boni_m_import_at') === null, 'слота и метки нет');
T.ok(!JSON.stringify([T.store('boni_m_metrics')]).includes('M73.'), 'строки переноса нет и в статистике');
T.ok(Object.keys(T.window.sessionStorage).length === 0, 'строка не ушла в sessionStorage');

// «Отмена» → знакомство, хранилище пусто.
T.click('#mv-no'); await T.sleep(20);
T.ok(T.text().includes('Как вас зовут'), '«Отмена» → знакомство');
T.ok(T.store('boni_m_state') === null && T.store('boni_m_state_before_move') === null && T.store('boni_m_import_at') === null,
  'после «Отмена» в хранилище по-прежнему пусто');
T.ok(T.$('#m-have'), 'на знакомстве есть «У меня уже есть прогресс…»');
T.ok(T.restarts === 0, 'перезапуска не было');

// Сеть: перенос не сделал ни одного запроса, кроме статистики; код в консоль не попал.
await T.sleep(3300);
T.ok(T.sentOut.every((r) => r.url.endsWith('/ping')), 'сетевых запросов, кроме статистики, нет');
T.ok(!T.consoleSeen.some((l) => l.includes('M73' + '.')), 'код переноса в консоль не попал');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
void migrate;
T.finish();
