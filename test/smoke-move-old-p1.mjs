// Старый адрес, поставка П1: MOVE_HOME = false (как в move.js), буфера обмена нет (ТЗ-переезд.md, 7.2).
// На главной карточки нет, в настройках есть; без clipboard раскрывается поле с кодом.
import { boot, OLD, snapshot } from './move-harness.mjs';
import { readFileSync } from 'node:fs';

const T0 = readFileSync(new URL('../app/js/move.js', import.meta.url), 'utf8');
const snap = await snapshot();
const T = await boot({ url: OLD, store: { boni_m_state: JSON.stringify(snap) }, name: 'smoke-move-old-p1' });
T.ok(/export const MOVE_HOME = false;/.test(T0) && /export const MOVE_SETTINGS = true;/.test(T0) && /export const MOVE_FINAL = false;/.test(T0), 'в поставке MOVE_HOME=false, MOVE_SETTINGS=true, MOVE_FINAL=false');
T.ok(T.$('#continue') && !T.$('#move-card'), 'на главной карточки нет');
T.click('#gear'); await T.sleep(20);
T.ok(T.$('#move-card'), 'в настройках карточка есть');
T.ok(await T.waitFor(() => T.$('#m-go') && T.$('#m-go').tagName === 'A'), 'ссылка собрана заранее');
T.click('#m-copy'); await T.sleep(30);
T.ok(T.$('#m-code-box') && T.$('#m-code-box').value.startsWith('M73.1.'), 'без clipboard раскрывается поле с кодом');
T.ok(T.$('#m-code-box').hasAttribute('readonly'), 'поле только для чтения');
T.ok(T.text().includes('Нажмите на поле и удерживайте палец'), 'подсказка про выделение');
T.ok(T.$('#m-copy') && T.$$('#screen > .card')[1].id === 'move-card', 'карточка сразу после «Кто в эфире»');
T.ok(!T.$('#m-new-card'), 'карточки «Перенос с другого адреса» на старом адресе нет');
T.ok(!T.$('#m-have') , 'на старом адресе нет приёма');
// «Нужен интернет».
T.finish();
