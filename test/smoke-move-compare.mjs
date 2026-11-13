// Новый адрес: свой прогресс уже есть → сравнение; «Оставить как здесь»; другое окно (ТЗ-переезд.md, 7.2).
import { boot, NEW, codeFor, snapshot, mkState } from './move-harness.mjs';
import { migrate } from '../app/js/state.js';
import * as G from '../app/js/gamify.js';

const snap = await snapshot();
const mine = migrate({ profile: { name: 'Вася' }, progress: { ru: { learnedCount: 4,
  perChar: { 'Е': { correct: 3, total: 4 } } } }, history: [{ date: '2026-11-01', answers: 4, accuracyPct: 75 }] });
const rawMine = JSON.stringify(mine);
const T = await boot({ url: `${NEW}#perenos=${await codeFor(snap)}`, store: { boni_m_state: rawMine }, name: 'smoke-move-compare' });

T.ok(T.$('#mv-confirm') && T.text().includes('Здесь уже есть прогресс'), 'видно сравнение');
T.ok(T.$$('table.mv-table tr.mv-cmp').length === 4, 'таблица сравнения: ровно четыре строки');
T.ok(T.$$('table.mv-table thead th').length === 2 && T.text().includes('Старый адрес'), 'заголовки столбцов: Старый адрес | Здесь');
T.ok(T.$('.mv-cmp.diff') && T.$('.mv-cmp.diff').textContent.includes('Имя'), 'строка «Имя» выделена (имена разные)');
const cells = (T.$$('tr.mv-cmp').map((r) => [...r.children].map((c) => c.textContent.trim()).join('|')));
for (const s of ['Освоено букв|27 из 32|4 из 32', 'Имя|Бонислав|Вася']) T.ok(cells.includes(s), `строка таблицы: «${s}»`);
T.ok(T.$('#mv-yes').textContent === 'Взять со старого адреса' && T.$('#mv-no').textContent === 'Оставить как здесь', 'подписи кнопок точные');
T.ok(T.text().includes('закройте их'), 'строка про другие окна');
T.ok(!T.text().includes('Здесь прогресса больше'), 'здесь меньше — строки «больше» нет');
T.ok(T.store('boni_m_state') === rawMine, 'до ответа хранилище не тронуто (побайтно)');

// Другое окно: метка приёма → перезапуск; обычный ответ (boni_m_state) → нет.
const ev = (key) => { const e = new T.window.StorageEvent('storage', { key }); T.window.dispatchEvent(e); };
ev('boni_m_state'); ev('boni_m_metrics'); ev(null);
T.ok(T.restarts === 0, 'событие storage по boni_m_state (ответ в другом окне) перезапуск НЕ вызывает');
ev('boni_m_import_at');
T.ok(T.restarts === 1, 'событие storage по boni_m_import_at → перезапуск');
// Возврат из фона: метка в хранилище отличается от стартовой.
T.setStore('boni_m_import_at', 'другое-окно-приняло');
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
document.dispatchEvent(new T.window.Event('visibilitychange'));
T.ok(T.restarts === 2, 'при возврате из фона метка сверяется → перезапуск');
T.window.localStorage.removeItem('boni_m_import_at');

// «Оставить как здесь» → как обычный старт без фрагмента.
T.click('#mv-no'); await T.sleep(30);
T.ok(T.text().includes('Здравствуйте, Вася') || T.text().includes('С возвращением, Вася'), '«Оставить как здесь» → главная со своим прогрессом');
const after = T.saved();
// Обычный старт без фрагмента: migrate + тихое доначисление вех (как в startNormal).
const want = migrate(JSON.parse(rawMine)); G.checkMilestones(want, { triggers: ['chars'] });
T.eq(after, want, 'состояние такое же, как после обычного старта без фрагмента');
T.ok(T.store('boni_m_state_before_move') === null, 'слота нет');
T.ok(T.store('boni_m_import_at') === null, 'метки приёма нет');
T.ok(T.$('#m-new-card') === null, 'на главной карточки переноса нет');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
void mkState;
T.finish();
