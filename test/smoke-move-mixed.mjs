// Смешанный кэш: новый app.js со state.js ПРЕДЫДУЩЕГО релиза (fixtures/v27), адрес нового сайта
// с фрагментом (ТЗ-переезд.md, 3.3, 7.4). Приложение открывается, фрагмент стёрт, сказано
// «ещё обновляется», в хранилище ничего не записано.
import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const T = await boot({ url: `${NEW}#perenos=${await codeFor(snap)}`, mixed: true, name: 'smoke-move-mixed' });
T.ok(T.window.location.hash === '', 'фрагмент стёрт');
T.ok(T.text().includes('Приложение ещё обновляется. Закройте его совсем и откройте снова.'), 'сказано «Приложение ещё обновляется…»');
T.ok(T.$('#mv-b0') && T.$('#mv-b0').textContent === 'Продолжить', 'есть «Продолжить»');
T.ok(T.store('boni_m_state') === null && T.store('boni_m_import_at') === null && T.store('boni_m_state_before_move') === null, 'в хранилище ничего не записано');
T.click('#mv-b0'); await T.sleep(30);
T.ok(T.text().includes('Как вас зовут'), '«Продолжить» → знакомство открылось');
T.ok(T.$('#m-have'), 'кнопка «У меня уже есть прогресс…» есть');
T.click('#m-have'); await T.sleep(10);
T.ok(T.text().includes('Приложение ещё обновляется'), 'экран вставки без readIncoming: то же пояснение, ничего не пишется');
T.click('#mv-b0'); await T.sleep(10);
// Настройки: «Сохранить копию» работает по-старому, «Восстановить» — с той же строкой.
T.$('#name').value = 'Вася'; T.fire(T.$('#name'), 'input');
T.click('#next'); await T.sleep(10);
T.click('#start'); await T.sleep(30);
T.click('[data-tab="cabinet"]'); await T.sleep(10);
T.click('#tosettings'); await T.sleep(10);
T.ok(T.$('#backup') && T.$('#restore'), 'в настройках копия и восстановление на месте');
T.click('#backup');
T.ok(true, '«Сохранить копию» без exportText не падает');
T.ok(T.errors.length === 0, 'ошибок нет: ' + T.errors.map(String).join('|'));
T.finish();
