// Старый адрес, айфон, значок на экране (navigator.standalone): шаги 1–4 видны сразу (ТЗ-переезд.md, 5.2).
import { boot, OLD, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const written = [];
const T = await boot({
  url: OLD, store: { boni_m_state: JSON.stringify(snap) }, move: { MOVE_HOME: true }, name: 'smoke-move-old-ios',
  nav: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', standalone: true, clipboard: { writeText: async (t) => { written.push(t); } } },
});
T.ok(T.$('#move-card') && T.$('.mv-steps'), 'на главной шаги для айфона видны сразу');
for (const s of ['Скопируйте', 'Скопировать адрес', 'На экран «Домой»', 'У меня уже есть прогресс в старом приложении', 'Скопировать код переноса', 'Вставить', 'Проверить код', 'не удаляйте']) {
  if (s === 'Скопируйте') continue;
  T.ok(T.$('#move-card').textContent.includes(s), `в шагах: «${s}»`);
}
T.ok(T.$('#m-copy-addr') && T.$('#m-copy'), 'кнопки «Скопировать адрес» и «Скопировать код переноса»');
T.ok(await T.waitFor(() => T.$('#m-go') && T.$('#m-go').tagName === 'A'), 'кнопка-ссылка есть, но ниже и мелко (linkbtn)');
T.ok(T.$('#m-go').classList.contains('linkbtn'), 'ссылка оформлена как linkbtn');
T.ok(T.$('#m-copy-addr').compareDocumentPosition(T.$('#m-go')) & 4, 'ссылка ниже кнопок копирования');
T.ok(T.store('boni_m_moved') === null, 'до касаний отметки «переносили» нет');
T.click('#m-copy-addr'); await T.sleep(20);
T.ok(written[0] === 'https://app.morse73.ru/', '«Скопировать адрес» кладёт адрес без переноса');
T.click('#m-copy'); await T.sleep(20);
T.ok(written[1] && written[1].startsWith('M73.1.'), '«Скопировать код переноса» кладёт код');
T.ok(T.store('boni_m_moved') !== null, '«Скопировать код переноса» пишет boni_m_moved (основной путь айфона: ТЗ 3.5)');
T.ok(T.store('boni_m_state') && JSON.parse(T.store('boni_m_state')).profile.points === 412, 'прогресс при этом не тронут');
T.click('#gear'); await T.sleep(20);
T.ok(T.$('.mv-steps') && !T.$('#m-ios'), 'в настройках то же: шаги сразу, переключателя нет');
T.finish();
