// Старый адрес со снимком v25, MOVE_HOME подменён на true (поставка П2) (ТЗ-переезд.md, 7.2).
import { boot, OLD, snapshot, decodeLink } from './move-harness.mjs';

const snap = await snapshot();
const written = [];
const T = await boot({
  url: OLD, store: { boni_m_state: JSON.stringify(snap) }, move: { MOVE_HOME: true }, name: 'smoke-move-old',
  nav: { clipboard: { writeText: async (t) => { written.push(t); } } },
});
const ready = () => T.$('#m-go') && T.$('#m-go').tagName === 'A';

// Главная: карточка НИЖЕ «Звания».
T.ok(await T.waitFor(() => T.$('#move-card') && ready()), 'на главной есть карточка «Приложение переехало»');
const card = T.$('#move-card');
const rank = [...T.$$('#screen .card')].find((c) => c.textContent.includes('Звание'));
T.ok(rank && (rank.compareDocumentPosition(card) & 4), 'карточка стоит ниже карточки «Звание»');
T.ok(card.previousElementSibling === rank, 'карточка сразу после «Звания» (выше — «Продолжить обучение»)');
T.ok(T.$('#continue').compareDocumentPosition(card) & 4, '«Продолжить обучение» выше карточки');
T.ok(card.textContent.includes('Приложение переехало') && card.textContent.includes('app.morse73.ru'), 'текст карточки');
T.ok(!card.textContent.includes('Скопировать код переноса'), 'на главной кода переноса нет (он — в настройках)');

// Ссылка.
const a = T.$('#m-go');
T.ok(a.getAttribute('href').startsWith('https://app.morse73.ru/#perenos=M73.1.'), 'href начинается с адреса нового сайта и кода');
T.ok(a.getAttribute('target') === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel), 'target=_blank, rel с noopener и noreferrer');
const dec = await decodeLink(a.getAttribute('href'));
T.eq(dec.state, snap, 'раскодированное равно migrate(снимок)');
T.ok(!JSON.stringify(dec.state).includes('boni_m_metrics'), 'номера установки статистики в строке нет');

// Касание пишет только отметку.
const rawBefore = T.store('boni_m_state'), metricsBefore = T.store('boni_m_metrics');
T.ok(T.store('boni_m_moved') === null, 'до касания отметки нет');
T.ok(T.$('#m-help') && !T.$('#m-help-text'), '«Не открылось?» есть и свёрнуто');
T.click('#m-help'); await T.sleep(10);
T.ok(T.$('#m-help-text') && T.$('#m-help-text').textContent.includes('Закройте новый адрес совсем'), '«Не открылось?» раскрывается');
T.click('#m-help'); await T.sleep(10);
T.ok(!T.$('#m-help-text'), 'и сворачивается обратно');
T.click('#m-go');
T.ok(T.store('boni_m_moved') !== null, 'касание пишет boni_m_moved');
const moved = JSON.parse(T.store('boni_m_moved'));
T.ok(/^\d{4}-\d{2}-\d{2}$/.test(moved.at) && moved.secs === 18000 && moved.answers === 63, `отметка: дата, секунды, ответы (${JSON.stringify(moved)})`);
T.ok(T.store('boni_m_state') === rawBefore, 'boni_m_state побайтно тот же');
T.ok(T.store('boni_m_metrics') === metricsBefore, 'boni_m_metrics не изменился');
T.ok(await T.waitFor(() => T.$('#move-card') && T.$('#move-card').textContent.includes('Вы открывали перенос'), 1500), 'после перерисовки: «Вы открывали перенос …»');
T.ok(T.$('#m-open') && T.$('#m-open').getAttribute('href') === 'https://app.morse73.ru/', '«Открыть новый адрес» — ссылка без переноса');
T.ok(T.$('#move-card').textContent.includes('Перенести ещё раз'), 'есть «Перенести ещё раз»');
T.ok(!T.text().includes('Прогресс перенесён'), 'старый адрес не говорит «перенесён»');

// Занятие → «После переноса вы занимались здесь».
T.click('[data-tab="learn"]'); await T.sleep(20);
T.ok(!T.$('#move-card'), 'во время занятия карточки на экране нет');
await T.waitFor(() => T.$$('#opts .opt').some((b) => !b.disabled), 3000);
T.$$('#opts .opt').find((b) => !b.disabled).click(); await T.sleep(20);
T.click('[data-tab="home"]'); await T.sleep(30);
T.ok(await T.waitFor(() => T.$('#move-card') && T.$('#move-card').textContent.includes('После переноса вы занимались здесь'), 1500), 'после занятия: «После переноса вы занимались здесь»');
T.ok(T.$('#move-card').textContent.includes('Эти занятия на новый адрес не попали'), 'сказано, что занятия не попали');

// Другие режимы: карточки нет.
T.click('[data-tab="key"]'); await T.sleep(20);
T.ok(!T.$('#move-card'), '«Ключ»: карточки нет');
T.click('[data-tab="home"]'); await T.sleep(20);
T.click('#puzzle'); await T.sleep(20);
T.ok(!T.$('#move-card'), 'Радиоигра: карточки нет');
T.click('#back'); await T.sleep(10);
T.click('#radiogram'); await T.sleep(20);
T.ok(!T.$('#move-card'), 'радиограмма: карточки нет');
T.click('#back'); await T.sleep(10);

// Настройки: карточка сразу после «Кто в эфире», код переноса и шаги для айфона.
T.click('#gear'); await T.sleep(20);
const cards = T.$$('#screen > .card');
T.ok(cards[0].textContent.includes('Кто в эфире') && cards[1].id === 'move-card', 'в настройках карточка сразу после «Кто в эфире»');
T.ok(await T.waitFor(() => T.$('#m-copy') && !T.$('#m-copy').disabled), 'кнопка «Скопировать код переноса» готова');
T.ok(T.$('#m-ios') && T.$('#m-ios').textContent === 'Как перенести на айфоне', 'есть «Как перенести на айфоне»');
const hrefNow = T.$('#m-go').getAttribute('href');
T.click('#m-copy'); await T.sleep(20);
T.ok(written.length === 1 && hrefNow.endsWith(written[0]) && written[0].startsWith('M73.1.'), 'буфер получил тот же код, что в ссылке');
T.ok(T.$('#m-copy').textContent === 'Код скопирован' && T.$('.mv-steps'), 'на месте кнопки «Код скопирован», под ней шаги');
T.click('#m-ios'); await T.sleep(10);
T.ok(T.$('#m-ios'), 'переключатель шагов не падает');

// Сеть и консоль.
await T.sleep(3300);
T.ok(T.sentOut.every((r) => r.url.endsWith('/ping')), 'запросов, кроме /ping, нет');
for (const r of T.sentOut) T.ok(Object.keys(JSON.parse(r.body).events?.[0] || {}).length <= 4, 'в событии статистики не больше четырёх полей');
T.ok(!T.consoleSeen.some((l) => l.includes('M73' + '.')), 'код переноса в консоль не попал');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
T.finish();
