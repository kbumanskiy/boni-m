// Новый адрес, Android: после переноса на главной один раз карточка «Готово» (ТЗ-переезд.md, 5.3).
import { boot, NEW, snapshot } from './move-harness.mjs';

const snap = await snapshot();
let prompted = 0;
const T = await boot({
  url: NEW, store: { boni_m_state: JSON.stringify(snap) }, session: { boni_m_moved_ok: '1' }, name: 'smoke-move-done',
  nav: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' },
});
T.ok(T.$('#m-done') && T.$('#m-done').textContent.includes('Готово, прогресс перенесён'), 'на главной карточка «Готово, прогресс перенесён»');
T.ok(T.text().includes('Теперь занимайтесь здесь') && T.text().includes('из этого же браузера'), 'текст про значок из этого же браузера');
T.ok(T.text().includes('Добавить на главный экран') && T.text().includes('Добавить ярлык'), 'без системного запроса — подсказка про меню (и про Яндекс)');
T.ok(T.text().includes('Старый значок пока не удаляйте'), '«Старый значок пока не удаляйте»');
T.ok(!T.$('#m-install'), 'кнопки «Поставить значок на экран» ещё нет');
T.ok(T.window.sessionStorage.getItem('boni_m_moved_ok') === null, 'флаг стёрт при первом показе');
T.ok(T.$('#m-done').compareDocumentPosition(T.$('#continue')) & 4, 'карточка выше кнопок (её увидят)');
// Системный запрос установки: только по касанию человека.
const e = new T.window.Event('beforeinstallprompt', { cancelable: true });
e.prompt = () => { prompted++; };
T.window.dispatchEvent(e);
T.ok(e.defaultPrevented, 'мини-панель браузера погашена, пока карточка ждёт');
T.ok(T.$('#m-install') && T.$('#m-install').textContent === 'Поставить значок на экран', 'появилась кнопка «Поставить значок на экран»');
T.ok(prompted === 0, 'запрос без касания не показывается');
T.click('#m-install'); await T.sleep(10);
T.ok(prompted === 1 && !T.$('#m-install'), 'по касанию — системный запрос, кнопка убрана');
// Один раз.
T.click('[data-tab="cabinet"]'); await T.sleep(10);
T.click('[data-tab="home"]'); await T.sleep(10);
T.ok(!T.$('#m-done'), 'при возврате на главную карточки больше нет');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
T.finish();
