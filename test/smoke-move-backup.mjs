// «Отправить копию» (ТЗ-переезд.md, 12.1): общий доступ с файлом, запасные пути.
import { boot, NEW, snapshot } from './move-harness.mjs';
import { readIncoming } from '../app/js/state.js';

const snap = await snapshot();
const shared = [];
let shareFails = null;
const created = [];
const T = await boot({
  url: NEW, store: { boni_m_state: JSON.stringify(snap) }, name: 'smoke-move-backup',
  nav: {
    share: (data) => { shared.push(data); return shareFails ? Promise.reject(shareFails) : Promise.resolve(); },
    canShare: (d) => d && d.files && d.files.every((f) => f.type === 'application/json'),
  },
});
globalThis.URL.createObjectURL = (b) => { created.push(b); return 'blob:x'; };
const settings = async () => { T.click('[data-tab="cabinet"]'); await T.sleep(10); T.click('#tosettings'); await T.sleep(10); };
await settings();
T.ok(T.$('#backup').textContent.includes('Отправить копию'), 'основная кнопка — «Отправить копию»');
T.click('#backup'); await T.sleep(10);
T.ok(shared.length === 1 && shared[0].files.length === 1, 'navigator.share получил один файл');
const f = shared[0].files[0];
T.ok(f.type === 'application/json' && /^boni-m-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name), 'имя и тип файла');
const text = await f.text();
T.eq(readIncoming(text).state, snap, 'в файле — то же, что пишет «Сохранить копию» (читается тем же приёмом)');
T.ok(text === JSON.stringify(JSON.parse(text), null, 2), 'формат — exportText (два пробела отступа)');
T.ok(created.length === 0, 'скачивание не запускалось');
// Человек закрыл окно: тихо.
shareFails = Object.assign(new Error('x'), { name: 'AbortError' });
T.click('#backup'); await T.sleep(10);
T.ok(created.length === 0 && !T.$('#m-note').textContent, 'AbortError — молча, без скачивания и текста');
// Иная ошибка: скачивание файлом.
shareFails = Object.assign(new Error('x'), { name: 'NotAllowedError' });
T.click('#backup'); await T.sleep(10);
T.ok(created.length === 1, 'иная ошибка — запасное скачивание');
// text/plain, если json не подходит.
globalThis.navigator.canShare = (d) => d.files.every((x) => x.type === 'text/plain');
shareFails = null;
await settings();
T.click('#backup'); await T.sleep(10);
T.ok(shared.at(-1).files[0].type === 'text/plain', 'json отвергнут — файл уходит как text/plain');
// Нет canShare: «Сохранить копию» (скачивание).
delete globalThis.navigator.canShare;
await settings();
T.ok(T.$('#backup').textContent.includes('Сохранить копию'), 'без canShare остаётся «Сохранить копию»');
const n = shared.length;
T.click('#backup'); await T.sleep(10);
T.ok(shared.length === n && created.length === 2, 'и она скачивает файл');
T.ok(T.$('#file').getAttribute('accept') === '.json,application/json,text/plain', 'выбор файла принимает json и text/plain');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
T.finish();
