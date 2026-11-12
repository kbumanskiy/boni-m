// Старый адрес, MOVE_HOME = true: имя стёрто в настройках, прогресс есть → знакомство с переносом (ТЗ-переезд.md, 3.5).
import { boot, OLD, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const nameless = { ...snap, profile: { ...snap.profile, name: '' } };
const T = await boot({ url: OLD, store: { boni_m_state: JSON.stringify(nameless) }, move: { MOVE_HOME: true }, name: 'smoke-move-old-onb' });
T.ok(T.text().includes('Как вас зовут'), 'знакомство открылось (имя пустое)');
T.ok(await T.waitFor(() => T.$('#m-go') && T.$('#m-go').tagName === 'A'), 'есть ссылка «Перенести прогресс»');
T.ok(T.$('#move-card').textContent.includes('Ваш прогресс можно перенести туда'), 'текст «Ваш прогресс можно перенести туда»');
T.ok(T.$('#m-go').textContent === 'Перенести прогресс', 'кнопка «Перенести прогресс»');
T.ok(T.$('#m-copy') && T.$('#m-copy').textContent === 'Скопировать код переноса', 'и «Скопировать код переноса»');
T.ok(!T.$('#m-have'), 'приёма на старом адресе нет');
T.finish();
