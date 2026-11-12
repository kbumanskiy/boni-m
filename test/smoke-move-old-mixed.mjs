// Старый адрес со смешанным кэшем: новый app.js со state.js прежнего релиза (нет exportText/readIncoming).
// Карточки переезда нет вовсе — а не вечное «Готовлю перенос…» (ТЗ-переезд.md, 3.3).
import { boot, OLD, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const T = await boot({ url: OLD, store: { boni_m_state: JSON.stringify(snap) }, move: { MOVE_HOME: true }, mixed: true, name: 'smoke-move-old-mixed' });
T.ok(T.$('#continue'), 'главная открылась');
T.ok(!T.$('#move-card'), 'на главной карточки переезда нет');
T.click('#gear'); await T.sleep(30);
T.ok(T.$('#backup') && !T.$('#move-card') && !T.text().includes('Готовлю перенос'), 'в настройках карточки нет, «Готовлю перенос…» нет');
T.ok(T.store('boni_m_moved') === null, 'отметки нет');
T.finish();
