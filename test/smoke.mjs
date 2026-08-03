// Дымовой тест интерфейса через JSDOM: реальный рендер экранов и клики.
// Ловит ошибки времени выполнения (селекторы, undefined). Звука нет — приложение
// деградирует (playCode без AudioContext сразу вызывает onDone).
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// Глобалы для модуля приложения.
const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
const setGlobal = (k, v) => { try { global[k] = v; } catch {} };
setGlobal('window', window);
setGlobal('document', document);
// navigator в Node 24 — read-only встроенный; обращения в приложении и так защищены проверками.
setGlobal('location', window.location);
setGlobal('localStorage', window.localStorage);
setGlobal('Blob', window.Blob);
setGlobal('Event', window.Event);
setGlobal('FileReader', window.FileReader || class { readAsText() {} });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
window.confirm = () => true;
window.alert = () => {};
window.scrollTo = () => {};
window.AudioContext = undefined; // без звука — деградация
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};

const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const click = (sel) => { const el = document.querySelector(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); };
const text = () => document.querySelector('#screen').textContent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await import('../app/app.js');
await sleep(10);

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓', msg); };

// 1) Онбординг показан
ok(text().includes('Как вас зовут'), 'онбординг: вопрос имени');

// 2) Заполнить имя → Дальше → Начать
const name = document.querySelector('#name');
name.value = 'Бонислав'; fire(name, 'input');
ok(!document.querySelector('#next').disabled, 'кнопка «Дальше» разблокирована после ввода имени');
click('#next');
ok(text().includes('Рады знакомству, Бонислав'), 'онбординг: шаг 2 с именем');
click('#start');
await sleep(10);

// 3) Главная
ok(!document.querySelector('#overlay-root .overlay'), 'при входе не выпадает поздравлений');
ok(text().includes('Продолжить обучение'), 'главная: кнопка продолжить');
ok(text().includes('Освоено: 4 из 32'), 'главная: стартовый набор 4 знака');
ok(!document.querySelector('#tabs').classList.contains('hidden'), 'нижняя навигация видна');

// 4) Учиться: рендер, варианты, ответ
click('[data-tab="learn"]');
await sleep(20);
const opts = document.querySelectorAll('#opts .opt');
ok(opts.length >= 4, `учиться: минимум 4 кнопки (${opts.length})`);
ok([...opts].some((b) => !b.disabled), 'учиться: варианты разблокированы после проигрывания');
ok(document.querySelector('#lspeed'), 'учиться: регулятор скорости морзянки есть');
// Правило «занятие засчитывается от 15 ответов» было невидимым: папа мог заниматься
// каждый день по 10 ответов и не понимать, почему «дни в эфире» стоят на нуле.
ok(document.querySelector('#counter')?.textContent.includes('15'),
  'учиться: видно, сколько ответов нужно для зачёта занятия');

// Ответить один раз и проверить блокировку.
const overlayEl = document.querySelector('#overlay-root');
// Дождаться, пока раунд снова можно отвечать. События (новый знак/веха) и лёгкое
// подтверждение «Верно!» переходят к следующему знаку асинхронно — ждём этого, а не
// гадаем по таймеру. Заодно проходим возможный диалог «отложить знак».
async function waitAnswerable(ms = 3000) {
  for (let t = 0; t < ms; t += 20) {
    document.querySelector('#keep')?.click();
    const opt = [...document.querySelectorAll('#opts .opt')].find((b) => !b.disabled);
    if (opt) return opt;
    await sleep(20);
  }
  return null;
}
// Копим нарушения правила «после ошибки — никаких поздравлений». Проверяется на каждом
// неверном ответе: игра не должна ни открывать знак, ни объявлять веху.
const wrongAnswerViolations = [];
let wrongAnswersSeen = 0;
let nextbtnWasGuarded = false;
const learnedNow = () => {
  const st = JSON.parse(localStorage.getItem('boni_m_state'));
  return st.progress.ru.learnedCount + st.progress.ru.digitsLearned;
};

async function answerOnce() {
  overlayEl.innerHTML = '';                    // снять возможный оверлей-событие
  const opt = await waitAnswerable();
  if (!opt) return;
  const before = learnedNow();
  opt.click();
  await sleep(8);
  if (document.querySelector('#opts .opt.wrong')) {
    wrongAnswersSeen++;
    // Диалог «отложить трудный знак» — законное следствие ошибки, поздравления — нет.
    const overlay = overlayEl.querySelector('.overlay');
    if (overlay && !overlayEl.querySelector('#park')) {
      wrongAnswerViolations.push('оверлей после ошибки: ' + overlay.textContent.trim().slice(0, 60));
    }
    if (learnedNow() > before) wrongAnswerViolations.push('после ошибки открылся новый знак');
    // «Дальше» намеренно недоступна первые ~450 мс: иначе то же касание, которым дан
    // неверный ответ, пролистывало бы разбор, не дав его прочитать.
    const btn = document.querySelector('#nextbtn');
    if (btn && btn.disabled) nextbtnWasGuarded = true;
    for (let t = 0; t < 1500 && document.querySelector('#nextbtn')?.disabled; t += 25) await sleep(25);
    document.querySelector('#nextbtn')?.click(); // неверно → «Дальше»
  }
  // верный ответ авто-переходит сам — следующий answerOnce дождётся через waitAnswerable
}
await answerOnce();
// после ответа: либо кнопки заблокированы (показ кода), либо начался новый раунд — но без ошибок
ok(true, 'учиться: ответ обработан без ошибок');

// 4б) БЛОКЕР: сессия должна засчитаться при уходе через нижнее меню, а не только по «Выход».
for (let i = 0; i < 40; i++) await answerOnce();

// 4в) БЛОКЕР: после неверного ответа игра не поздравляет и не открывает новый знак.
ok(wrongAnswersSeen > 0, `в прогоне встретились неверные ответы (${wrongAnswersSeen}) — проверка осмысленна`);
ok(wrongAnswerViolations.length === 0, `после ошибки нет поздравлений и новых знаков${wrongAnswerViolations.length ? ': ' + wrongAnswerViolations.join(' | ') : ''}`);
ok(nextbtnWasGuarded, 'кнопка «Дальше» защищена от случайного нажатия тем же касанием');
// Разбор ошибки идёт ПОД сеткой букв: иначе кнопка встаёт туда, где только что был палец.
const revealBox = document.querySelector('#reveal');
ok(revealBox && [...document.querySelector('#screen').children].indexOf(revealBox)
   > [...document.querySelector('#screen').children].indexOf(document.querySelector('#opts')),
  'разбор ошибки расположен ниже сетки букв');
const histBefore = JSON.parse(localStorage.getItem('boni_m_state')).history.length;
click('[data-tab="home"]'); // уход через нижнюю навигацию, НЕ кнопкой «Выход»
await sleep(20);
const st = JSON.parse(localStorage.getItem('boni_m_state'));
ok(st.history.length === histBefore + 1, `сессия записана в журнал при уходе через меню (было ${histBefore}, стало ${st.history.length})`);
ok(st.streak.current === 1, 'серия дней засчитана при уходе через меню');
ok(st.history.at(-1).answers >= 15, `в журнале ≥15 ответов (${st.history.at(-1).answers})`);

// 4г) Первый знак занятия запоминается между запусками: папа каждый раз открывает
// приложение заново, и без этого занятие начиналось бы одной и той же буквой.
const savedFirst = JSON.parse(localStorage.getItem('boni_m_state')).progress.ru.lastFirst;
ok(typeof savedFirst === 'string' && savedFirst.length === 1,
  `знак, с которого началось занятие, сохранён («${savedFirst}»)`);

// 5) Ключ — режим «Тренировка» (по умолчанию)
click('[data-tab="key"]');
await sleep(10);
ok(document.querySelector('#pad'), 'ключ: площадка отрисована');
ok(document.querySelector('#pad').tagName === 'BUTTON', 'ключ: площадка — настоящая кнопка (клавиатура и диктор)');
ok(document.querySelector('#pad').getAttribute('aria-label'), 'ключ: у площадки есть доступное название');
ok(text().includes('Отстучите'), 'ключ: подсказка-цель (тренировка)');
ok(document.querySelector('#kspeed'), 'ключ: регулятор скорости ключа есть');

// 5а) Палец, чуть сползший с площадки, НЕ должен обрывать тире — иначе разбор говорит
// «вышло Е вместо М» и не намекает, что причина в съехавшем пальце.
const padTrain = document.querySelector('#pad');
fire(padTrain, 'pointerdown');
ok(padTrain.classList.contains('down'), 'ключ: нажатие видно');
fire(padTrain, 'pointerleave');
ok(padTrain.classList.contains('down'), 'ключ: сползший палец не обрывает знак');
// А вот отпускание пальца где угодно обязано закрыть знак: иначе тон звучал бы бесконечно.
window.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
ok(!padTrain.classList.contains('down'), 'ключ: отпускание пальца вне площадки закрывает знак');
await sleep(750);

// 5б) Клавиатура: пробел работает как нажатие и удержание, автоповтор не плодит лишние точки.
const keyEv = (type, code, repeat = false) =>
  padTrain.dispatchEvent(new window.KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
keyEv('keydown', 'Space');
ok(padTrain.classList.contains('down'), 'ключ: пробел нажимает площадку');
keyEv('keydown', 'Space', true); // автоповтор системы
keyEv('keydown', 'Space', true);
await sleep(60);
keyEv('keyup', 'Space');
ok(!padTrain.classList.contains('down'), 'ключ: отпускание пробела снимает нажатие');
await sleep(750); // дождаться разбора знака (пауза конца знака смягчена до 0,6 с)
ok(document.querySelector('#keychar').textContent.trim().length > 0,
  'ключ: набор с клавиатуры разобран (автоповтор не сломал знак)');

// 5б) Ключ — режим «Свободно»: переключение, реальное отстукивание, авто-пробел, стирание
click('.seg [data-m="free"]');
await sleep(10);
ok(document.querySelector('#text'), 'ключ: строка свободного набора отрисована');
ok(document.querySelector('#erase') && document.querySelector('#clear'), 'ключ: кнопки «Стереть» и «Очистить» есть');
ok(text().includes('пробел'), 'ключ: подсказка про свободный набор');

// Реальное отстукивание: короткое нажатие = точка; в рус. таблице «.» = Е.
const pad = document.querySelector('#pad');
fire(pad, 'pointerdown'); await sleep(60); fire(pad, 'pointerup');
await sleep(750); // > паузы конца знака (смягчена до 0,6 с) → декодирование
ok(document.querySelector('#text').textContent.includes('Е'), 'ключ: отстуканная точка дала букву Е');

// Авто-пробел по длинной паузе — и ровно один.
await sleep(1100);
ok(document.querySelector('#text').textContent.includes('Е '), 'ключ: длинная пауза поставила один пробел');

// Стирание: убрать пробел, затем букву.
document.querySelector('#erase').click();
document.querySelector('#erase').click();
ok(!document.querySelector('#text').textContent.includes('Е'), 'ключ: «Стереть» убрало набранное');
document.querySelector('#clear').click();
ok(true, 'ключ: «Очистить» отработало без ошибок');
click('.seg [data-m="train"]');             // вернуть тренировочный режим

// 6) Справочник + карточка знака + переключение алфавита
click('[data-tab="ref"]');
await sleep(10);
ok(document.querySelectorAll('.cell').length === 32, 'справочник: 32 русские буквы');
click('.cell');
await sleep(10);
ok(document.querySelector('#overlay-root .overlay'), 'справочник: карточка знака открылась');
click('#overlay-root #x');
click('[data-s="digits"]');
ok(document.querySelectorAll('.cell').length === 10, 'справочник: 10 цифр');
click('[data-a="en"]');
click('[data-s="letters"]');
ok(document.querySelectorAll('.cell').length === 26, 'справочник: 26 латинских букв');

// 7) Кабинет: открывается ОТДЕЛЬНОЙ вкладкой «Журнал», язык переключается понятными кнопками
click('[data-tab="ref"]'); // вернуть ru
click('[data-a="ru"]');
ok(document.querySelector('#tabs [data-tab="cabinet"]'), 'нижнее меню: есть вкладка «Журнал»');
click('[data-tab="cabinet"]'); // открыть кабинет вкладкой, а не тапом по портрету
await sleep(10);
// Одно место — одно имя: вкладка «Журнал» и заголовок «Журнал» (было «Бортжурнал»).
ok(text().includes('Мои успехи'), 'журнал: открылся со вкладки');
ok(!text().includes('Бортжурнал'), 'журнал: вкладка и заголовок называются одинаково');
ok(document.querySelector('#name').value === 'Бонислав', 'журнал: имя подставлено');
ok(document.querySelector('#lang-ru') && document.querySelector('#lang-en'), 'журнал: курс — кнопки «Русская/Латинская»');
click('#lang-en'); // переключение языка не падает
await sleep(10);
ok(JSON.parse(localStorage.getItem('boni_m_state')).settings.alphabet === 'en', 'журнал: курс переключился на латинский');
click('#lang-ru');
await sleep(10);
click('#vib'); // тумблер вибрации не падает
click('#chants');
ok(true, 'журнал: тумблеры настроек работают');

// Пока адрес не задан (а в поставке он пуст), блоков «Поддержать» и «Написать автору»
// быть не должно вообще. Иначе приложение обновится само и папа получит мёртвую кнопку.
ok(!document.querySelector('.support'), 'журнал: без адреса карточки доната нет');
ok(!document.querySelector('#feedback'), 'журнал: без адреса формы обратной связи нет');
click('[data-tab="home"]');
await sleep(10);
ok(!document.querySelector('#support-line'), 'главная: без адреса строки доната нет');

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест пройден: ${pass} проверок, ошибок ${errors.length}`);
