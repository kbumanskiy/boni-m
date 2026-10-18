// Дымовой тест интерфейса через JSDOM: реальный рендер экранов и клики.
// Ловит ошибки времени выполнения (селекторы, undefined). Звук — поддельный контекст
// из test/fake-audio.mjs: «работает», часы идут в тысячу раз быстрее настоящих.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { LIMITS } from '../app/js/timing.js';
import { migrate } from '../app/js/state.js';
import { makeFakeAudio } from './fake-audio.mjs';

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
const fakeAudio = makeFakeAudio();
window.AudioContext = fakeAudio.AudioContext; // звук «работает», но быстро и беззвучно
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};

const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const click = (sel) => { const el = document.querySelector(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); };
const text = () => document.querySelector('#screen').textContent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Звук теперь идёт по часам (пусть и ускоренным), а не завершается мгновенно:
// ждём состояния интерфейса, а не гадаем по таймеру.
async function waitFor(cond, ms = 3000) {
  for (let t = 0; t < ms; t += 5) { if (cond()) return true; await sleep(5); }
  return !!cond();
}
const listen = async () => { click('#pz-listen'); await waitFor(() => document.querySelector('#pz-opts button')); await sleep(5); };

// Сеть заглушена: в JSDOM настоящий fetch Node ушёл бы на живой приёмник. Запоминаем,
// что приложение пыталось отправить, — на этом держится проверка «наружу ничего лишнего».
const sentOut = [];
global.fetch = async (url, opts = {}) => {
  sentOut.push({ url: String(url), body: String(opts.body || ''), keepalive: !!opts.keepalive });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

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
// Позывной при первом запуске пуст: раньше здесь стоял чужой («Boney M», позывной папы),
// и человек первым делом видел в поле не своё, а потом слышал это в упражнении.
ok(document.querySelector('#callsign').value === '', 'онбординг: поле позывного пустое');
ok(!!document.querySelector('#callsign').placeholder, 'онбординг: у позывного есть подсказка');
click('#next');
ok(text().includes('Рады знакомству, Бонислав'), 'онбординг: шаг 2 с именем');
click('#start');
await sleep(20);

// 3) «Начать занятие» открывает само занятие, а не главную с «Продолжить обучение»:
// человек ещё не услышал ни одного знака, продолжать ему нечего.
ok(document.querySelectorAll('#opts .opt').length === 4, '«Начать занятие» сразу открывает занятие на 4 знаках');
ok(text().includes('Учиться') && !text().includes('Повторение'), 'занятие — обычное «Учиться», не «Повторение»');
ok(!document.querySelector('#overlay-root .overlay'), 'при входе не выпадает поздравлений');
ok(JSON.parse(localStorage.getItem('boni_m_state')).milestones.first4 === true,
  'веха «первые 4 знака» записана молча при старте — не теряется и не выпадает посреди занятия');
ok(!document.querySelector('#tabs').classList.contains('hidden'), 'нижняя навигация видна');

// 3а) Новичок вышел, не ответив ни разу. Признак «ещё не занимался» — ни одного ответа
// (счётчики perChar пусты) и пустой журнал: открыть занятие и уйти — не занятие.
// Поэтому «Начать обучение», а «Повторения» нет — повторять нечего.
click('#exit');
await sleep(20);
ok(text().includes('Начать обучение') && !text().includes('Продолжить обучение'),
  'главная новичка без ответов: «Начать обучение», а не «Продолжить»');
ok(!document.querySelector('#review'), 'главная новичка без ответов: «Повторения пройденного» нет');
ok(document.querySelector('#puzzle'), 'главная новичка: плитка «Радиоигра» на месте');
ok(text().includes('Освоено: 4 из 32'), 'главная: стартовый набор 4 знака');
ok(!document.querySelector('#overlay-root .overlay'), 'на главной новичка не выпадает поздравлений');

// 3б) «Начать обучение» ведёт в обычное занятие.
click('#continue');
await sleep(20);
ok(document.querySelectorAll('#opts .opt').length === 4, '«Начать обучение» открывает занятие');

// 4) Учиться: рендер, варианты, ответ
const opts = document.querySelectorAll('#opts .opt');
ok(opts.length >= 4, `учиться: минимум 4 кнопки (${opts.length})`);
ok([...opts].some((b) => !b.disabled), 'учиться: варианты разблокированы после проигрывания');
// В занятии один регулятор — скорость знака. Пауза на раздумье уехала в настройки:
// два ползунка с объяснением превращали экран занятия в чтение.
ok(document.querySelector('#lchar'), 'учиться: регулятор скорости знака есть');
ok(!document.querySelector('#lspeed'), 'учиться: ползунка пауз здесь нет — он в настройках');
ok(!text().includes('это и есть метод Коха'), 'учиться: длинного объяснения на экране занятия нет');
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

// 4а) Один ответ дан, до зачёта (15) далеко — ушёл на «Главную». Он уже занимался:
// «Продолжить обучение» и «Повторение» на месте, хотя в журнале занятия ещё нет.
click('[data-tab="home"]');
await sleep(20);
ok(JSON.parse(localStorage.getItem('boni_m_state')).history.length === 0, 'один ответ — занятие в журнал не записано');
ok(text().includes('Продолжить обучение') && !text().includes('Начать обучение'),
  'после первого ответа на главной «Продолжить обучение»');
ok(document.querySelector('#review'), 'после первого ответа «Повторение пройденного» есть');
click('[data-tab="learn"]');
await sleep(20);

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

// 5в) Пробел должен работать СРАЗУ после перехода на экран: на компьютере фокус остаётся
// на кнопке нижнего меню, до площадки нажатие не доходит. Поэтому диспатчим в document.body.
const docKey = (type, code, repeat = false) =>
  document.body.dispatchEvent(new window.KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
docKey('keydown', 'Space');
ok(padTrain.classList.contains('down'), 'ключ: пробел работает без фокуса на площадке');
docKey('keydown', 'Space', true); // автоповтор системы
docKey('keydown', 'Space', true);
await sleep(60);
docKey('keyup', 'Space');
ok(!padTrain.classList.contains('down'), 'ключ: пробел мимо площадки отпускает нажатие');
await sleep(750);
ok(document.querySelector('#keychar').textContent.trim().length > 0,
  'ключ: знак с пробела мимо площадки разобран');

// Пробел, набранный в ТЕКСТОВОМ поле, — это пробел, а не удар ключом. На «Ключе» таких
// полей нет, поэтому для проверки поле создаётся на время. Ползунок скорости — не текстовое
// поле: после подкрутки скорости пробел обязан бить по ключу дальше (см. ниже).
const tmpField = document.createElement('input');
tmpField.type = 'text';
document.body.appendChild(tmpField);
tmpField.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
ok(!padTrain.classList.contains('down'), 'ключ: пробел в текстовом поле не бьёт по площадке');
tmpField.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'Space', bubbles: true, cancelable: true }));
tmpField.remove();

// А с фокусом на ползунке скорости пробел ключом БЫТЬ обязан: человек подкрутил
// скорость и сразу стучит дальше — отнять у него пробел значит сломать занятие.
const kspeedField = document.querySelector('#kspeed');
kspeedField.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
ok(padTrain.classList.contains('down'), 'ключ: пробел с фокусом на ползунке бьёт по площадке');
kspeedField.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'Space', bubbles: true, cancelable: true }));
await sleep(750);

// Потеря фокуса окном при зажатом пробеле (Alt-Tab): keyup уйдёт в чужое окно, поэтому
// нажатие обязано сброситься само — иначе тон звучит бесконечно.
docKey('keydown', 'Space');
ok(padTrain.classList.contains('down'), 'ключ: пробел зажат перед потерей фокуса');
window.dispatchEvent(new window.Event('blur'));
ok(!padTrain.classList.contains('down'), 'ключ: уход из окна снимает залипшее нажатие');
docKey('keyup', 'Space'); // «отпускание» после возврата уже ничего не ломает
await sleep(750);

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

// 5г) Уйдя с «Ключа», глобальный пробел обязан отцепиться: иначе он молча ломал бы
// прокрутку и нажатие кнопок на всех остальных экранах.
click('[data-tab="home"]');
await sleep(10);
const errorsBeforeSpace = errors.length;
docKey('keydown', 'Space');
docKey('keyup', 'Space');
await sleep(10);
ok(!document.querySelector('#pad'), 'ключ: экран покинут, площадки нет');
ok(errors.length === errorsBeforeSpace,
  'ключ: пробел вне экрана «Ключ» ничего не ломает');
click('[data-tab="key"]'); await sleep(10);
click('.seg [data-m="train"]');
await sleep(10);

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
ok(!document.querySelector('#callsign'), 'журнал: поля профиля переехали в настройки');
// Настройки уехали из «Журнала» на свой экран (отзыв R7CL с форума: выбор языка
// искали и не нашли). В журнале на их месте — пункт, ведущий туда же, куда шестерёнка.
ok(!document.querySelector('#lang-ru'), 'журнал: настроек курса здесь больше нет');
ok(document.querySelector('#tosettings'), 'журнал: есть пункт «Открыть настройки»');
ok(document.querySelector('#gear'), 'журнал: шестерёнка в шапке');
click('#tosettings');
await sleep(10);
ok(text().includes('Настройки'), 'настройки: экран открылся из журнала');
ok(document.querySelector('#lang-ru') && document.querySelector('#lang-en'), 'настройки: курс — кнопки «Русская/Латинская»');
// Позывной звучит в упражнении «Принять свой позывной», поэтому его должно быть где менять:
// с форума спросили, почему у всех звучит «Boney M».
ok(document.querySelector('#s-name')?.value === 'Бонислав', 'настройки: имя подставлено');
const callField = document.querySelector('#s-call');
ok(callField, 'настройки: есть поле позывного');
callField.value = 'ra9flc';
callField.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(10);
ok(JSON.parse(localStorage.getItem('boni_m_state')).profile.callsign === 'RA9FLC',
  'настройки: позывной сохранён заглавными');
// Без позывного упражнение принимать нечего — и кнопки быть не должно.
{
  const { callsignDrillAvailable } = await import('../app/js/gamify.js');
  const full = { learnedCount: 33, digitsLearned: 10 };
  ok(callsignDrillAvailable(full, 'ru', '') === false, 'без позывного упражнение не появляется');
  ok(callsignDrillAvailable(full, 'ru', 'RA9FLC') === true, 'с позывным — появляется');
}
const sndBtn = document.querySelector('#ansnd');
ok(sndBtn, 'настройки: есть тумблер звука после ответа');
sndBtn.click();
await sleep(10);
ok(JSON.parse(localStorage.getItem('boni_m_state')).settings.answerSound === false,
  'настройки: звук после ответа выключается');
document.querySelector('#ansnd').click();
await sleep(10);
click('#lang-en'); // переключение языка не падает
await sleep(10);
ok(JSON.parse(localStorage.getItem('boni_m_state')).settings.alphabet === 'en', 'настройки: курс переключился на латинский');
click('#lang-ru');
await sleep(10);
click('#vib'); // тумблер вибрации не падает
click('#chants');
ok(true, 'настройки: тумблеры работают');
// Анонимная статистика: тумблер есть, по умолчанию включён, выключается и это запоминается.
const statsBtn = document.querySelector('#stats');
ok(statsBtn && statsBtn.getAttribute('aria-checked') === 'true', 'настройки: статистика по умолчанию включена');
ok(text().includes('Без имени, позывного и прогресса'), 'настройки: сказано, что именно уходит');
click('#stats');
await sleep(10);
ok(JSON.parse(localStorage.getItem('boni_m_state')).settings.metrics === false, 'настройки: статистику можно выключить');
click('#stats');
await sleep(10);

// Главная жалоба с форума: скорость знака была зашита намертво и не менялась.
const charSlider = document.querySelector('#lchar');
ok(charSlider, 'настройки: есть ползунок скорости знака');
ok(+charSlider.max === LIMITS.charWpm.max, 'настройки: скорость знака доходит до 45 WPM = 225 зн/мин');
charSlider.value = String(LIMITS.charWpm.max);
charSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(10);
const savedSpeed = JSON.parse(localStorage.getItem('boni_m_state')).settings.charWpm;
ok(savedSpeed === LIMITS.charWpm.max, 'настройки: скорость знака сохраняется');
ok(text().includes('225 зн/мин'), 'настройки: скорость показана в знаках в минуту');
// Настройка обязана дожить до следующего запуска: миграция когда-то молча
// возвращала её обратно, и «скорость не регулируется» повторялось назавтра.
ok(migrate(JSON.parse(localStorage.getItem('boni_m_state'))).settings.charWpm === LIMITS.charWpm.max,
  'настройки: быстрая скорость переживает перезапуск');
const toneSlider = document.querySelector('#tone');
ok(+toneSlider.min === LIMITS.toneHz.min && +toneSlider.max === LIMITS.toneHz.max,
  'настройки: тон настраивается от 400 до 1000 Гц');
// Паузы не могут быть короче знака — иначе получится скорость выше заявленной.
const pauseSlider = document.querySelector('#lspeed');
pauseSlider.value = String(LIMITS.charWpm.max);
pauseSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(10);
const speedState = JSON.parse(localStorage.getItem('boni_m_state')).settings;
ok(speedState.effWpm <= speedState.charWpm, 'настройки: паузы не короче самого знака');
// Вернуть спокойные значения, чтобы дальнейшие проверки шли на обычных настройках.
charSlider.value = '18'; charSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
pauseSlider.value = '9'; pauseSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(10);
click('#back');
await sleep(10);
ok(text().includes('Мои успехи'), 'настройки: «Назад» вернуло в журнал');

// Блок появляется РОВНО тогда, когда задан адрес. Оба направления важны: мёртвая
// кнопка на телефоне выглядит поломкой, а пропавшая кнопка теряет донаты молча.
const { DONATE_URL, FEEDBACK_URL } = await import('../app/js/support.js');
const donateOn = DONATE_URL !== '';
const feedbackOn = FEEDBACK_URL !== '';

ok(!!document.querySelector('.support') === donateOn,
  donateOn ? 'журнал: карточка доната на месте' : 'журнал: без адреса карточки доната нет');
ok(!!document.querySelector('#feedback') === feedbackOn,
  feedbackOn ? 'журнал: форма обратной связи на месте' : 'журнал: без адреса формы обратной связи нет');

if (donateOn) {
  const card = document.querySelector('.support a.btn');
  ok(card && card.getAttribute('href') === DONATE_URL, 'журнал: кнопка доната ведёт на заданный адрес');
  ok(card && card.getAttribute('rel') === 'noopener', 'журнал: ссылка доната открывается безопасно');
  // Подсказка ведёт к СБП, а не к карте: карта на телефоне из установленного приложения
  // срывается на коде из СМС (письмо 11 сентября 2026, F7 в ДОРАБОТКИ.md).
  const how = document.querySelector('.support .hint:last-child')?.textContent || '';
  ok(/СБП/.test(how) && !/карта или СБП/.test(how), 'журнал: подсказка под кнопкой доната ведёт к СБП');
}

click('[data-tab="home"]');
await sleep(10);
const line = document.querySelector('#support-line');
ok(!!line === donateOn,
  donateOn ? 'главная: строка доната на месте' : 'главная: без адреса строки доната нет');
if (donateOn) ok(line.getAttribute('href') === DONATE_URL, 'главная: строка доната ведёт на заданный адрес');

// Анонимная статистика: сворачивание завершает занятие и шлёт событие; в нём нет ничего личного.
const { METRICS_KEY } = await import('../app/js/metrics.js');
const { PINGS_URL } = await import('../app/js/support.js');
sentOut.length = 0;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
document.dispatchEvent(new window.Event('visibilitychange'));
await sleep(20);
const ping = sentOut.find((r) => r.url === PINGS_URL);
ok(ping, 'статистика: при сворачивании уходит событие занятия');
ok(ping.keepalive, 'статистика: запрос переживает выгрузку приложения (keepalive)');
const pingBody = JSON.parse(ping.body);
ok(Object.keys(pingBody).sort().join() === 'events,from,id', 'статистика: в отправке только номер, источник и события');
ok(!ping.body.includes('Бонислав') && !ping.body.includes('callsign') && !ping.body.includes('progress'),
  'статистика: ни имени, ни позывного, ни прогресса наружу не уходит');
ok(JSON.parse(localStorage.getItem(METRICS_KEY)).queue.length === 0, 'статистика: после ответа сервера очередь пуста');
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
document.dispatchEvent(new window.Event('visibilitychange'));
await sleep(10);
// Выключили — ничего не копится и не уходит.
click('[data-tab="cabinet"]'); await sleep(10);
click('#gear'); await sleep(10);
click('#stats'); await sleep(10);
sentOut.length = 0;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
document.dispatchEvent(new window.Event('visibilitychange'));
await sleep(20);
ok(!sentOut.some((r) => r.url === PINGS_URL), 'статистика: выключена — ничего не отправляется');
ok(JSON.parse(localStorage.getItem(METRICS_KEY)).queue.length === 0, 'статистика: выключена — ничего не копится');
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });

// 8) Радиоигра. Проверки — в конце файла намеренно: вставка в середину сдвигает порядок
// остальных шагов (см. грабли в СТАТУС.md).
{
  const PZ = await import('../app/js/puzzle.js');
  const saved = () => JSON.parse(localStorage.getItem('boni_m_state'));
  const hidden = () => document.querySelector('#tabs').classList.contains('hidden');
  const rightOf = (cat) => PZ.qById(cat, saved().puzzle[cat].last).right;
  const optBtn = (o) => document.querySelector(`#pz-opts button[data-o="${o}"]`);

  click('[data-tab="home"]'); await sleep(10);
  const tile = document.querySelector('#puzzle');
  ok(tile && tile.tagName === 'BUTTON', 'главная: плитка «Радиоигра» — настоящая кнопка');
  ok(tile.getAttribute('aria-label').startsWith('Радиоигра'), 'главная: доступное имя плитки начинается с «Радиоигра»');
  ok(!tile.querySelector('.pill-new'), 'главная: у чистой установки пометки «Новое» нет');
  ok(!tile.textContent.includes('Разгадано'), 'главная: пока ничего не разгадано — счётчика нет');
  // Порядок главной: «Продолжить» → плитка → «Повторение» → карточка звания.
  const kids = [...document.querySelector('#screen').children];
  const at = (sel) => kids.indexOf(document.querySelector(sel));
  const rankCard = kids.find((el) => el.classList.contains('card') && el.textContent.includes('Звание'));
  ok(at('#continue') < at('#puzzle') && at('#puzzle') < at('#review') && at('#review') < kids.indexOf(rankCard),
    'главная: «Продолжить» → плитка → «Повторение» → звание');

  // Ответы режима не трогают ни буквы, ни зачёт дня, ни очки, ни серию.
  const snap = () => { const st = saved();
    return JSON.stringify({ p: st.progress, h: st.history, s: st.streak, pts: st.profile.points, m: st.milestones }); };
  const before = snap();
  const secondsBefore = saved().totalSeconds;

  click('#puzzle'); await sleep(10);
  ok(hidden(), 'Радиоигра: на выборе категорий нижнее меню спрятано');
  ok(document.querySelectorAll('.pz-cat').length === 4, 'Радиоигра: четыре категории');
  ok(text().includes('Боня передаёт пять сообщений'), 'Радиоигра: вводная Бони');
  ok(text().includes('0 из 30'), 'Радиоигра: счётчики категорий');
  ok(document.querySelector('#gear') && document.querySelector('#back'), 'Радиоигра: шестерёнка и «Назад» в шапке');

  click('.pz-cat[data-cat="msg"]'); await sleep(10);
  ok(!document.querySelector('#pz-opts'), 'вопрос: до звука вариантов нет');
  ok(document.querySelectorAll('.pz-cell').length === PZ.qById('msg', saved().puzzle.msg.last).text.replace(/ /g, '').length,
    'вопрос: клеточек столько, сколько букв');
  ok(!document.querySelector('.pz-ch').textContent, 'вопрос: клеточки пустые — ответ не подсмотреть');
  await listen();
  ok(document.querySelectorAll('#pz-opts .pz-opt').length === 3, 'вопрос: после звука — три варианта');
  ok(document.querySelector('#pz-listen').textContent.includes('Ещё раз'), 'вопрос: «Слушать» стало «Ещё раз»');
  click('#pz-slow'); await sleep(5);
  ok(document.querySelector('#pz-slow').getAttribute('aria-pressed') === 'true', 'вопрос: «Медленнее» включается');
  click('#pz-code'); await sleep(5);
  ok(document.querySelectorAll('.pz-cell .trace').length === document.querySelectorAll('.pz-cell').length,
    'вопрос: «Показать точки-тире» — код под каждой клеточкой');
  click('#pz-abc'); await sleep(5);
  const letters = new Set(PZ.qById('msg', saved().puzzle.msg.last).text.replace(/ /g, ''));
  ok(document.querySelectorAll('.pz-abc > div').length === letters.size, 'вопрос: азбука — только знаки этого сообщения');

  // Неверный ответ: вариант гаснет, штрафа нет, можно выбрать снова.
  const right0 = rightOf('msg');
  const wrong0 = [...document.querySelectorAll('#pz-opts button')].find((b) => b.dataset.o !== right0);
  wrong0.click(); await sleep(5);
  ok(optBtn(wrong0.dataset.o).disabled, 'неверный вариант гаснет');
  ok(document.querySelector('#pz-fb').textContent.includes('Не то'), 'неверно: «Не то. Послушайте ещё раз.»');
  ok(!document.querySelector('.pz-reveal'), 'неверно: разгадки ещё нет — можно выбрать снова');
  optBtn(right0).click(); await sleep(5);
  ok(text().includes('Верно!'), 'разгадка на том же экране: «Верно!»');
  ok(document.querySelector('.pz-ch').textContent.length === 1, 'разгадка: буквы проступили в клеточках');
  ok(document.querySelector('#pz-relisten') && document.querySelector('#pz-next'), 'разгадка: «Послушать» и «Дальше»');

  // Остальные четыре: один — до последнего оставшегося варианта, три — сразу верно.
  for (let i = 1; i < 5; i++) {
    click('#pz-next'); await sleep(5);
    ok(!document.querySelector('#pz-opts'), `вопрос ${i + 1}: до звука вариантов нет`);
    await listen();
    const right = rightOf('msg');
    if (i === 2) {
      for (const b of [...document.querySelectorAll('#pz-opts button')].filter((x) => x.dataset.o !== right)) {
        b.click(); await sleep(5);
      }
      ok(text().includes('Остался один ответ'), 'два промаха — вопрос засчитан, показана разгадка');
    } else {
      optBtn(right).click(); await sleep(5);
    }
  }
  ok(document.querySelector('#pz-next').textContent.includes('Итог раунда'), 'на пятом вопросе — «Итог раунда»');
  click('#pz-next'); await sleep(5);
  ok(text().includes('Раунд пройден'), 'итог раунда на экране, без окна');
  ok(/С первой попытки\s*3 из 5/.test(text()), `итог: с первой попытки 3 из 5 (${text().match(/\d из 5/)?.[0]})`);
  ok(document.querySelector('#pz-again') && document.querySelector('#pz-tocats'), 'итог: «Ещё раунд» и «К категориям»');
  ok(snap() === before, 'Радиоигра не пишет в буквы, журнал, серию, очки и вехи');
  ok(saved().puzzle.msg.solved.length === 5, 'разгаданное записано в колоду (5 из 30)');
  ok(saved().puzzle.msg.seen.length === 5, 'показанные вопросы учтены в круге');
  ok(saved().totalSeconds > secondsBefore, 'время раунда вошло во «время в эфире»');

  click('#pz-tocats'); await sleep(5);
  ok(document.querySelector('.pz-cat[data-cat="msg"]').textContent.includes('5 из 30'), 'категории: счётчик «5 из 30»');
  click('#back'); await sleep(10);
  ok(!hidden(), '«Назад» с категорий — на главную, меню снова видно');
  ok(document.querySelector('#puzzle .mt-cnt')?.textContent.includes('Разгадано 5 из 120'), 'плитка: «Разгадано 5 из 120»');
  ok(!document.querySelector('#puzzle .pill-new'), 'плитка: пометки «Новое» нет');

  // Шестерёнка из вопроса и «Назад» из настроек: не пустой экран, а выбор категорий.
  click('#puzzle'); await sleep(5);
  click('.pz-cat[data-cat="word"]'); await sleep(5);
  await listen();
  const pics = [...document.querySelectorAll('#pz-opts .pz-pic')];
  ok(pics.length === 3 && pics.every((b) => /^Картинка \d$/.test(b.getAttribute('aria-label')) && !b.textContent.trim()),
    '«Слово»: три картинки без подписей, для диктора — «Картинка N»');
  const wordId = saved().puzzle.word.last;
  click('#gear'); await sleep(5);
  ok(text().includes('Настройки'), 'из режима открываются настройки');
  click('#back'); await sleep(10);
  ok(saved().puzzle.word.last === wordId && document.querySelectorAll('#pz-opts .pz-pic').length === 3 && hidden(),
    '«Назад» из настроек — тот же вопрос, варианты на месте, меню спрятано');
  click('#back'); await sleep(5);
  ok(document.querySelectorAll('.pz-cat').length === 4, '«Назад» из вопроса после настроек — к категориям');

  // «Назад» из вопроса — к категориям; сворачивание посреди вопроса — зовём послушать заново.
  click('.pz-cat[data-cat="riddle"]'); await sleep(5);
  click('#back'); await sleep(5);
  ok(document.querySelectorAll('.pz-cat').length === 4, '«Назад» из вопроса — к категориям');
  click('.pz-cat[data-cat="riddle"]'); await sleep(5);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new window.Event('visibilitychange'));
  await sleep(10);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new window.Event('visibilitychange'));
  await sleep(10);
  ok(document.querySelector('#pz-fb').textContent === 'Нажмите «Слушать».', 'после сворачивания: «Нажмите «Слушать».»');
  ok(!document.querySelector('#pz-opts'), 'после сворачивания варианты не открылись сами');
  click('#back'); await sleep(5);
  click('#back'); await sleep(5);
  ok(!hidden() && document.querySelector('#continue'), 'вышли на главную');

  click('[data-tab="cabinet"]'); await sleep(5);
  ok(/Радиоигра: разгадано\s*5 из 120/.test(text()), 'журнал: «Радиоигра: разгадано 5 из 120»');

  // Шестерёнка посреди раунда не сбрасывает раунд: вопрос 3 с погасшим вариантом → настройки
  // → «Назад» → тот же вопрос в том же виде. С итога — обратно на итог.
  click('[data-tab="home"]'); await sleep(5);
  click('#puzzle'); await sleep(5);
  click('.pz-cat[data-cat="story"]'); await sleep(5);
  for (let i = 0; i < 2; i++) {
    await listen();
    optBtn(rightOf('story')).click(); await sleep(5);
    click('#pz-next'); await sleep(5);
  }
  await listen();
  const q3 = saved().puzzle.story.last;
  const wrong3 = [...document.querySelectorAll('#pz-opts button')].find((b) => b.dataset.o !== rightOf('story')).dataset.o;
  optBtn(wrong3).click(); await sleep(5);
  click('#gear'); await sleep(5);
  ok(text().includes('Настройки'), 'вопрос 3: шестерёнка открыла настройки');
  click('#back'); await sleep(10);
  ok(text().includes('вопрос 3 из 5'), 'из настроек: счётчик «вопрос 3 из 5»');
  ok(saved().puzzle.story.last === q3, 'из настроек: тот же вопрос');
  ok(optBtn(wrong3)?.disabled === true && document.querySelectorAll('#pz-opts button:not([disabled])').length === 2,
    'из настроек: погасший вариант погашен, остальные доступны');
  ok(document.querySelector('#pz-listen').textContent.includes('Ещё раз') && document.querySelector('#pz-fb').textContent.includes('Не то'),
    'из настроек: сигнал уже услышан, подсказка прежняя');
  ok(hidden(), 'из настроек: меню спрятано, как в режиме');
  optBtn(rightOf('story')).click(); await sleep(5);
  click('#pz-next'); await sleep(5);
  for (let i = 0; i < 2; i++) {
    await listen();
    optBtn(rightOf('story')).click(); await sleep(5);
    click('#pz-next'); await sleep(5);
  }
  ok(document.querySelector('#pz-again'), 'раунд «История» дошёл до итога');
  click('#gear'); await sleep(5);
  click('#back'); await sleep(10);
  ok(document.querySelector('#pz-again') && /4 из 5/.test(text()), 'из настроек с итога — обратно на итог (4 из 5)');
  click('#pz-tocats'); await sleep(5);
  click('#back'); await sleep(5);

  // Звук не проснулся (айфон без касания). Модуль звука держит уже созданный контекст,
  // поэтому подмена конструктора ничего не даст: усыпляем тот же экземпляр и запрещаем
  // ему просыпаться. В конце блока будим обратно — следующие окна работают со звуком.
  const sleepy = fakeAudio.last;
  ok(sleepy, 'поддельный звук создан и используется приложением');
  sleepy.state = 'suspended'; sleepy.resumeHangs = true;
  click('[data-tab="home"]'); await sleep(5);
  click('#puzzle'); await sleep(5);
  click('.pz-cat[data-cat="word"]'); await sleep(5);
  click('#pz-listen');
  await sleep(1700);
  ok(!document.querySelector('#pz-opts'), 'звук не проснулся — варианты не открываются');
  ok(document.querySelector('#pz-fb').textContent === 'Нажмите «Слушать» ещё раз.', 'звук не проснулся — «Нажмите «Слушать» ещё раз.»');
  // «Учиться» на том же спящем звуке: надпись А, кнопки закрыты (ТЗ, раздел 10.6.5).
  click('#back'); await sleep(5);
  click('#back'); await sleep(5);
  const answersBefore = JSON.stringify(saved().progress.ru.perChar);
  click('[data-tab="learn"]');
  await sleep(1700);
  ok(document.querySelector('#fb').textContent.includes('Звук не включился')
    && document.querySelector('#fb').textContent.includes('Послушать ещё раз'), '«Учиться», звук не проснулся: «Звук не включился… Послушать ещё раз»');
  ok([...document.querySelectorAll('#opts .opt')].every((b) => b.disabled), '«Учиться», звук не проснулся: кнопки закрыты');
  document.querySelector('#opts .opt').click(); await sleep(5);
  ok(JSON.stringify(saved().progress.ru.perChar) === answersBefore, '«Учиться», звук не проснулся: ответ не засчитан');
  sleepy.resumeHangs = false; sleepy.state = 'running';
  click('#again');
  ok(await waitFor(() => [...document.querySelectorAll('#opts .opt')].some((b) => !b.disabled)), '«Послушать ещё раз» после пробуждения — кнопки открылись');
  click('#exit'); await sleep(10);
}

// Смешанный кэш при обновлении: новый app.js со СТАРЫМ state.js, который поля puzzle не знает
// (миграция его не добавила). Главная обязана открыться. Подменяем state.js загрузчиком,
// отдельным экземпляром приложения в чистом документе.
{
  const { registerHooks } = await import('node:module');
  const realState = new URL('../app/js/state.js', import.meta.url).href;
  const fakeState = realState + '?nopuzzle';
  registerHooks({
    resolve(spec, ctx, next) {
      if (ctx.parentURL && ctx.parentURL.includes('app.js?nopuzzle') && spec === './js/state.js') return { url: fakeState, shortCircuit: true };
      return next(spec, ctx);
    },
    load(url, ctx, next) {
      if (url === fakeState) return { format: 'module', shortCircuit: true, source:
        `import * as S from '${realState}'; export * from '${realState}';
         export function load(...a) { const s = S.load(...a); delete s.puzzle; return s; }` };
      return next(url, ctx);
    },
  });
  const dom2 = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
  const w2 = dom2.window;
  const errors2 = [];
  w2.addEventListener('error', (e) => errors2.push(e.error || e.message));
  w2.localStorage.setItem('boni_m_state', localStorage.getItem('boni_m_state'));
  Object.assign(w2, { scrollTo: () => {}, confirm: () => true, alert: () => {}, AudioContext: fakeAudio.AudioContext,
    requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame });
  setGlobal('window', w2); setGlobal('document', w2.document);
  setGlobal('location', w2.location); setGlobal('localStorage', w2.localStorage);
  let crash = null;
  try { await import('../app/app.js?nopuzzle'); } catch (e) { crash = e; }
  await sleep(20);
  ok(!crash && errors2.length === 0, `нет state.puzzle (старый state.js): приложение не падает${crash ? ' — ' + crash.message : ''}`);
  ok(w2.document.querySelector('#continue') && w2.document.querySelector('#puzzle'), 'нет state.puzzle: главная открылась, плитка Радиоигры на месте');
  w2.document.querySelector('#puzzle').click(); await sleep(10);
  ok(w2.document.querySelectorAll('.pz-cat').length === 4, 'нет state.puzzle: режим открывается');
  ok(errors2.length === 0, 'нет state.puzzle: без ошибок при входе в режим');
}

// 9) «Я уже знаю азбуку» (решение Кости 1.10.2026). Отдельная страница с новичком на
// четырёх знаках: проверка в конце файла и в своём окне, чтобы не сдвигать шаги выше.
{
  const seed = migrate({ profile: { name: 'Радист', callsign: 'UA5B' }, progress: { ru: { learnedCount: 4 } },
    milestones: { first4: true } });
  const dom3 = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
  const w3 = dom3.window, d3 = w3.document;
  const errors3 = [];
  w3.addEventListener('error', (e) => errors3.push(e.error || e.message));
  w3.localStorage.setItem('boni_m_state', JSON.stringify(seed));
  // Подтверждение обязано быть на странице: окно confirm() здесь — ошибка.
  let dialogs = 0;
  Object.assign(w3, { scrollTo: () => {}, confirm: () => { dialogs++; return true; }, alert: () => { dialogs++; },
    AudioContext: fakeAudio.AudioContext,
    requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame });
  setGlobal('window', w3); setGlobal('document', d3);
  setGlobal('location', w3.location); setGlobal('localStorage', w3.localStorage);
  await import('../app/app.js?knows');
  await sleep(20);
  const st3 = () => JSON.parse(w3.localStorage.getItem('boni_m_state'));
  const c3 = (sel) => { const el = d3.querySelector(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); };
  const t3 = () => d3.querySelector('#screen').textContent;
  const milestonesBefore = JSON.stringify(st3().milestones);
  ok(!d3.querySelector('#radiogram') && t3().includes('Освоено: 4 из 32'), 'знаю азбуку: у новичка радиограммы на главной нет');
  ok(!d3.querySelector('#drill'), 'знаю азбуку: у новичка «Принять свой позывной» (UA5B) закрыт');
  c3('#gear'); await sleep(10);
  const knows = d3.querySelector('#knows');
  ok(knows && knows.textContent.trim() === 'Я уже знаю азбуку', 'знаю азбуку: в настройках кнопка «Я уже знаю азбуку»');
  ok(t3().includes('Откроет контрольную радиограмму сразу — со всеми знаками.'), 'знаю азбуку: под кнопкой пояснение');
  c3('#knows'); await sleep(10);
  ok(t3().includes('Открыть радиограмму со всеми знаками?') && d3.querySelector('#knows-yes') && d3.querySelector('#knows-no'),
    'знаю азбуку: подтверждение раскрылось на странице (Да / Отмена)');
  ok(st3().settings.knowsAll === false, 'знаю азбуку: до «Да» отметка не ставится');
  c3('#knows-no'); await sleep(10);
  ok(d3.querySelector('#knows') && st3().settings.knowsAll === false, 'знаю азбуку: «Отмена» возвращает кнопку, отметки нет');
  c3('#knows'); await sleep(10);
  c3('#knows-yes'); await sleep(10);
  ok(st3().settings.knowsAll === true, 'знаю азбуку: «Да» ставит отметку и сохраняет');
  ok(t3().includes('Включено: радиограмма открыта со всеми знаками') && d3.querySelector('#knows-off'),
    'знаю азбуку: на месте кнопки — «Включено…» и «Выключить»');
  c3('#back'); await sleep(10);
  ok(d3.querySelector('#radiogram'), 'знаю азбуку: на главной появилась «Контрольная радиограмма»');
  ok(t3().includes('Освоено: 4 из 32'), 'знаю азбуку: «Освоено: 4 из 32» не изменилось');
  ok(d3.querySelector('#drill'), 'знаю азбуку: «Принять свой позывной» открылся');
  ok(st3().progress.ru.learnedCount === 4 && st3().profile.points === seed.profile.points, 'знаю азбуку: прогресс и очки не тронуты');
  ok(!d3.querySelector('#overlay-root .overlay'), 'знаю азбуку: никаких поздравлений');
  c3('#radiogram'); await sleep(10);
  // Смесь: буквы + цифры + знаки — проверяем, что звучат и цифры, хотя ни одной не освоено.
  c3('.seg [data-kind="mixed"]'); await sleep(10);
  let outside = false, digits = false;
  for (let i = 0; i < 3 && !(outside && digits); i++) {
    c3('#start'); await sleep(10);
    const sent = (w3.__rgText || '').replace(/\s+/g, '');
    if ([...sent].some((ch) => /[А-ЯЁ]/.test(ch) && !'ЕТИМ'.includes(ch))) outside = true;
    if (/[0-9]/.test(sent)) digits = true;
    c3('#abort'); await sleep(10);
    if (i < 2 && !(outside && digits)) { c3('#radiogram'); await sleep(10); }
  }
  ok(outside && digits, 'знаю азбуку: в тексте радиограммы есть буквы вне четырёх освоенных, и цифры тоже');
  ok(JSON.stringify(st3().milestones) === milestonesBefore, 'знаю азбуку: вехи не выпали');
  c3('#gear'); await sleep(10);
  c3('#knows-off'); await sleep(10);
  ok(st3().settings.knowsAll === false && d3.querySelector('#knows'), 'знаю азбуку: «Выключить» снимает отметку');
  c3('#back'); await sleep(10);
  ok(!d3.querySelector('#radiogram') && !d3.querySelector('#drill'), 'знаю азбуку: после «Выключить» кнопок радиограммы и позывного снова нет');
  ok(dialogs === 0, 'знаю азбуку: ни одного окна confirm/alert');
  ok(errors3.length === 0, 'знаю азбуку: без ошибок — ' + errors3.map(String).join(' | '));
}

// 10) Длинная радиограмма (ТЗ-длинные-радиограммы.md, 4.6, пункты 1–5 и 9). Своё окно:
// «Я уже знаю азбуку», скорость 60, рекорд 80. Звук — быстрый поддельный контекст.
{
  const seed = migrate({ profile: { name: 'Радист', callsign: '', points: 50 }, progress: { ru: { learnedCount: 4 } },
    settings: { knowsAll: true, radiogramCpm: 60 }, records: { radiogramCpm: 80 },
    milestones: { first4: true }, totalSeconds: 100 });
  const dom5 = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
  const w5 = dom5.window, d5 = w5.document;
  const errors5 = [];
  w5.addEventListener('error', (e) => errors5.push(e.error || e.message));
  w5.localStorage.setItem('boni_m_state', JSON.stringify(seed));
  Object.assign(w5, { scrollTo: () => {}, confirm: () => true, alert: () => {}, AudioContext: fakeAudio.AudioContext,
    requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame });
  setGlobal('window', w5); setGlobal('document', d5);
  setGlobal('location', w5.location); setGlobal('localStorage', w5.localStorage);
  await import('../app/app.js?long');
  await sleep(20);
  const st5 = () => JSON.parse(w5.localStorage.getItem('boni_m_state'));
  const c5 = (sel) => { const el = d5.querySelector(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); };
  const t5 = () => d5.querySelector('#screen').textContent.replace(/\s+/g, ' ');
  const opts = LIMITS.radiogramGroups.options;
  const groupsOf = () => (w5.__rgText || '').split(' ').filter(Boolean);
  const dbg = () => w5.__rgDebug;
  // Передача дозвучала: ждём состояния, а не времени.
  const waitEnded = async () => { assert.ok(await waitFor(() => dbg().ended, 8000), 'передача не дозвучала'); };

  c5('#radiogram'); await sleep(10);
  ok(d5.querySelectorAll('[data-dur]').length === 3, 'длинная: три кнопки длительности');
  ok(d5.querySelector('[data-dur="short"]').classList.contains('active'), 'длинная: по умолчанию — «Короткая», как раньше');
  ok(!d5.querySelector('[data-groups]'), 'длинная: ряда «Сколько групп» нет, пока не выбрана «Длинная»');
  ok(!d5.querySelector('[data-full]'), 'длинная: прежнего селектора data-full больше нет');
  const fullBefore = st5().settings.radiogramFull;
  c5('[data-dur="long"]'); await sleep(10);
  ok(d5.querySelectorAll('[data-groups]').length === opts.length, 'длинная: после выбора — ряд «Сколько групп»');
  ok(d5.querySelector(`[data-groups="${LIMITS.radiogramGroups.def}"]`).classList.contains('active'), 'длинная: по умолчанию выбрано 30');
  ok(t5().includes('30 групп по пять знаков') && t5().includes('Не по правилам'), 'длинная: подсказка «30 групп… Не по правилам»');
  ok(/около [\d,]+ (минут|минуты|секунд)/.test(t5()), `длинная: оценка длительности (${t5().match(/около [^ ]+ [^ ]+/)?.[0]})`);
  ok(st5().settings.radiogramLong === true && st5().settings.radiogramFull === fullBefore,
    'длинная: radiogramLong сохранён, radiogramFull не тронут (ради отката)');
  c5(`[data-groups="${opts[0]}"]`); await sleep(10);
  ok(st5().settings.radiogramGroups === opts[0] && t5().includes(`${opts[0]} групп`), `длинная: «${opts[0]}» сохраняется, подсказка меняется`);
  c5(`[data-groups="${opts.at(-1)}"]`); await sleep(10);
  ok(st5().settings.radiogramGroups === opts.at(-1), `длинная: «${opts.at(-1)}» сохраняется`);
  c5('[data-dur="minute"]'); await sleep(10);
  ok(!d5.querySelector('[data-groups]') && st5().settings.radiogramLong === false && st5().settings.radiogramFull === true,
    'длинная: «Минута» — ряд групп пропал, radiogramLong=false, radiogramFull=true');
  ok(st5().settings.radiogramGroups === opts.at(-1), 'длинная: выбранное число групп помнится и при «Минуте»');

  // «Минута» на приёме: строки «Осталось около…» нет.
  c5('#start'); await sleep(10);
  ok(!d5.querySelector('#rg-left'), 'Минута: строки оставшегося времени нет');
  c5('#abort'); await sleep(10);

  // «Длинная» на 50 группах: 50 групп по пять, время есть, числа групп — нет.
  c5('#radiogram'); await sleep(10);
  c5('[data-dur="long"]'); await sleep(10);
  ok(d5.querySelector(`[data-groups="${opts.at(-1)}"]`).classList.contains('active'), 'длинная: снова «Длинная» — выбрано то, что было');
  c5('#start'); await sleep(10);
  ok(groupsOf().length === opts.at(-1) && groupsOf().every((g) => g.length === 5), `длинная: ${opts.at(-1)} групп по пять`);
  ok(d5.querySelector('#rg-left') && /Осталось около|Последние секунды/.test(d5.querySelector('#rg-left').textContent),
    `длинная: «Осталось около…» (${d5.querySelector('#rg-left')?.textContent})`);
  const ta = d5.querySelector('#rg-input');
  ok(ta.getAttribute('rows') === '6' && ta.getAttribute('maxlength') === '600' && ta.getAttribute('enterkeyhint') === 'done'
    && ta.getAttribute('inputmode') === 'text', 'длинная: поле на 6 строк, maxlength 600, enterkeyhint=done, inputmode=text');
  ok((t5().match(/\d+\s+груп/g) || []).length === 0, 'длинная: на экране приёма нет числа групп');
  c5('#abort'); await sleep(10);

  // Разбор 30 групп с одной ошибкой.
  c5('#radiogram'); await sleep(10);
  c5(`[data-groups="${LIMITS.radiogramGroups.def}"]`); await sleep(10);
  const before = st5();
  async function runLong(spoil) {
    c5('#start'); await sleep(5);
    await waitEnded();
    const plain = (w5.__rgText || '').replace(/\s+/g, '');
    d5.querySelector('#rg-input').value = spoil(plain);
    c5('#rg-done'); await sleep(10);
    return plain;
  }
  const other = (ch) => (ch === 'Ж' ? 'Х' : 'Ж');
  await runLong((p) => p.slice(0, 7) + other(p[7]) + p.slice(8));
  ok(!t5().includes('Радиограмма принята') && !t5().includes('не принята'), 'разбор длинной: вердикта «принята/не принята» нет');
  ok(!d5.querySelector('.verdict'), 'разбор длинной: цветной плашки вердикта нет');
  ok(t5().includes('Верно: 99%'), `разбор длинной: «Верно: 99%» (${t5().match(/Верно: \d+%/)?.[0]})`);
  ok(/тренировка/i.test(t5()) && t5().includes('не по правилам'), 'разбор длинной: «тренировка» и «не по правилам»');
  ok(t5().includes('Тренировка: 30 групп') && t5().includes('30 групп · 150 знаков'), 'разбор длинной: заголовок и «30 групп · 150 знаков»');
  ok(d5.querySelectorAll('#rg-errors li').length === 1 && /Группа 2: передано/.test(t5()), 'разбор длинной: «Где ошибки» — «Группа 2: передано …»');
  ok(!t5().includes('скорость минус ошибки'), 'разбор длинной: строки «скорость минус ошибки» нет');
  const after = st5();
  ok(after.records.radiogramCpm === before.records.radiogramCpm && after.profile.points === before.profile.points
    && JSON.stringify(after.milestones) === JSON.stringify(before.milestones),
    'разбор длинной: рекорд, очки и вехи не изменились');
  ok(after.totalSeconds >= before.totalSeconds, 'разбор длинной: «Всего в эфире» не уменьшилось');
  ok(d5.querySelectorAll('.rg-group').length === 30, 'разбор длинной: 30 неразрывных групп');

  // «Быстрее» — при ≥95%; запускает снова «Длинную» с тем же числом групп.
  ok(d5.querySelector('#faster'), 'разбор длинной: при 99% есть «Быстрее на 10»');
  c5('#faster'); await sleep(5);
  ok(st5().settings.radiogramCpm === 70 && groupsOf().length === 30 && dbg().phase === 'receive', '«Быстрее»: снова «Длинная», 30 групп, 70 зн/мин');
  await waitEnded();
  d5.querySelector('#rg-input').value = 'Ж'.repeat(40);
  c5('#rg-done'); await sleep(10);
  ok(!d5.querySelector('#faster'), 'разбор длинной: при плохом ответе «Быстрее» нет');
  c5('#again'); await sleep(5);
  ok(groupsOf().length === 30 && st5().settings.radiogramCpm === 70, '«Ещё раз»: снова «Длинная», 30 групп, та же скорость');
  await waitEnded();

  // Разметка разбора: лишние знаки на своём месте, внутри группы; длинная вставка — своей серией.
  d5.querySelector('#rg-input').value = (() => { const p = (w5.__rgText || '').replace(/\s+/g, ''); return p.slice(0, 2) + 'Q' + p.slice(2); })();
  c5('#rg-done'); await sleep(10);
  const g1 = d5.querySelector('.rg-group');
  const kids = [...g1.children];
  ok(kids.length === 6 && kids[2].className === 'rg-extras' && kids[2].querySelector('.rg-extra')?.textContent === 'Q'
    && kids.filter((k) => k.className !== 'rg-extras').length === 5,
    'разметка: вставка после второго знака стоит после второго, внутри той же группы');
  c5('#again'); await sleep(5);
  await waitEnded();
  {
    const p = (w5.__rgText || '').replace(/\s+/g, '');
    const junk = 'Q'.repeat(100);
    d5.querySelector('#rg-input').value = junk + p.slice(0, 50) + junk + p.slice(50) + junk;
    c5('#rg-done'); await sleep(10);
    const runs = [...d5.querySelectorAll('.rg-extras')];
    ok(runs.length === 3 && runs.every((r) => r.children.length === 100 && r.parentElement.classList.contains('rg-group')),
      'разметка: вставки по 100 знаков в начале, середине и конце — три серии внутри групп');
    ok(d5.querySelectorAll('.rg-group').length === 30, 'разметка: групп по-прежнему 30');
  }

  // Статистика наружу — те же четыре поля и после длинной радиограммы.
  sentOut.length = 0;
  Object.defineProperty(d5, 'hidden', { configurable: true, get: () => true });
  d5.dispatchEvent(new w5.Event('visibilitychange'));
  await sleep(20);
  const ping5 = sentOut.find((r) => r.url.endsWith('/ping'));
  ok(ping5 && JSON.parse(ping5.body).events.every((e) => Object.keys(e).sort().join() === 'day,k,min,v'),
    'статистика после длинной: в событии только четыре поля (k, v, min, day)');
  Object.defineProperty(d5, 'hidden', { configurable: true, get: () => false });
  d5.dispatchEvent(new w5.Event('visibilitychange'));
  await sleep(10);
  c5('#leave'); await sleep(10);
  ok(errors5.length === 0, 'длинная: без ошибок — ' + errors5.map(String).join(' | '));
}

// 11) Смешанный кэш при обновлении (ТЗ-длинные-радиограммы.md, 7.3). Пока ставится новый
// service worker или копируются файлы на сервере, страница может получить модули разных
// выпусков. Каждое сочетание — отдельный экземпляр приложения в своём окне; подменённые
// модули грузятся из fixtures/v25/ (настоящий код v25, сверка хэшей — test/rollback.test.js).
{
  const { registerHooks } = await import('node:module');
  const appDir = new URL('../app/', import.meta.url).href;
  const fx = (f) => new URL(`../fixtures/v25/${f}`, import.meta.url).href;
  const stateUrl = appDir + 'js/state.js';
  const noNewFields = stateUrl + '?nonew';
  registerHooks({
    resolve(spec, ctx, next) {
      const parent = ctx.parentURL || '';
      // Новый app.js со старым state.js: в загруженном состоянии нет полей v26.
      if (parent.includes('app.js?oldstate') && spec === './js/state.js') return { url: noNewFields, shortCircuit: true };
      // Новый app.js со старыми timing.js, audio.js, support.js, data.js.
      if (parent.includes('app.js?oldmods')) {
        const m = /^\.\/js\/(timing|audio|support|data)\.js$/.exec(spec);
        if (m) return { url: fx(`${m[1]}.js`), shortCircuit: true };
      }
      // Старый app.js (v25) с новыми модулями: его ./js/* — настоящие файлы app/js/.
      if (parent.startsWith(fx('app.js')) && spec.startsWith('./js/')) return { url: appDir + spec.slice(2), shortCircuit: true };
      return next(spec, ctx);
    },
    load(url, ctx, next) {
      if (url === noNewFields) return { format: 'module', shortCircuit: true, source:
        `import * as S from '${stateUrl}'; export * from '${stateUrl}';
         export function load(...a) { const s = S.load(...a); delete s.settings.radiogramLong; delete s.settings.radiogramGroups; return s; }` };
      return next(url, ctx);
    },
  });

  // Общий каркас окна: своё хранилище, поддельный звук, ошибки — в свой список.
  async function boot(tag, seedState) {
    const d = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
    const w = d.window;
    const errs = [];
    w.addEventListener('error', (e) => errs.push(e.error || e.message));
    if (seedState) w.localStorage.setItem('boni_m_state', JSON.stringify(seedState));
    Object.assign(w, { scrollTo: () => {}, confirm: () => true, alert: () => {}, AudioContext: fakeAudio.AudioContext,
      requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame });
    setGlobal('window', w); setGlobal('document', w.document);
    setGlobal('location', w.location); setGlobal('localStorage', w.localStorage);
    let crash = null;
    try { await import(tag); } catch (e) { crash = e; }
    await sleep(20);
    const $w = (sel) => w.document.querySelector(sel);
    const cw = (sel) => { const el = $w(sel); assert.ok(el, `${tag}: нет элемента ${sel}`); el.click(); };
    const tw = () => w.document.querySelector('#screen').textContent;
    return { w, errs, crash, $w, cw, tw, st: () => JSON.parse(w.localStorage.getItem('boni_m_state')) };
  }
  const seedRg = migrate({ profile: { name: 'Радист', points: 5 }, progress: { ru: { learnedCount: 22 } },
    settings: { radiogramLong: true, radiogramGroups: 50 }, milestones: { first4: true } });
  // Приём до разбора: старт, ждём конца передачи (или ставим «Готово» сразу), разбор.
  async function receiveToResult(env, dur) {
    env.cw('#radiogram'); await sleep(10);
    if (env.$w(`[data-dur="${dur}"]`)) env.cw(`[data-dur="${dur}"]`);
    else env.cw(`[data-full="${dur === 'minute' ? 1 : 0}"]`); // старый app.js
    await sleep(10);
    env.cw('#start'); await sleep(10);
    await waitFor(() => /Передача окончена/.test(env.tw()), 6000);
    env.$w('#rg-input').value = (env.w.__rgText || '').replace(/\s+/g, '');
    env.cw('#rg-done'); await sleep(10);
    const res = /Радиограмма принята/.test(env.tw());
    env.cw('#leave'); await sleep(10);
    return res;
  }

  // а) новый app.js, старый state.js (полей radiogramLong/radiogramGroups нет).
  {
    const env = await boot('../app/app.js?oldstate', seedRg);
    ok(!env.crash && env.$w('#radiogram'), 'новый app.js + старый state.js: главная открылась');
    env.cw('#radiogram'); await sleep(10);
    ok(env.$w('[data-dur="short"]').classList.contains('active') && !env.$w('[data-groups]'),
      'новый app.js + старый state.js: подготовка радиограммы открылась, «Длинная» не выбрана');
    env.cw('#back'); await sleep(10);
    ok(env.errs.length === 0, 'новый app.js + старый state.js: без ошибок — ' + env.errs.map(String).join(' | '));
  }

  // б) новый app.js, старые timing.js, audio.js, support.js, data.js.
  {
    const OldT = await import(fx('timing.js'));
    const OldA = await import(fx('audio.js'));
    const OldS = await import(fx('support.js'));
    ok(OldT.LIMITS.radiogramGroups === undefined && !OldT.sequenceTimeline && !OldA.audioStatus && !OldS.guideUrl,
      'старые модули действительно старые: нет radiogramGroups, sequenceTimeline, audioStatus, guideUrl');
    const env = await boot('../app/app.js?oldmods', seedRg);
    ok(!env.crash && env.$w('#continue'), `новый app.js + старые модули: главная открылась${env.crash ? ' — ' + env.crash.message : ''}`);
    env.cw('#gear'); await sleep(10);
    ok(env.tw().includes('Настройки') && !env.$w('#guide-card'), 'новый app.js + старые модули: настройки открылись, карточки «Как пользоваться» нет');
    env.cw('#back'); await sleep(10);
    env.cw('#continue'); await sleep(10);
    ok(await waitFor(() => [...env.w.document.querySelectorAll('#opts .opt')].some((b) => !b.disabled)),
      'новый app.js + старые модули: «Учиться» — кнопки открываются');
    env.cw('#exit'); await sleep(10);
    env.cw('#radiogram'); await sleep(10);
    ok(!env.$w('[data-dur="long"]') && env.$w('[data-dur="short"]') && env.$w('[data-dur="minute"]'),
      'новый app.js + старый timing.js: «Длинной» нет, «Короткая» и «Минута» есть');
    env.cw('#back'); await sleep(10);
    ok(await receiveToResult(env, 'short'), 'новый app.js + старый timing.js: «Короткая» — полный приём до разбора');
    ok(await receiveToResult(env, 'minute'), 'новый app.js + старый timing.js: «Минута» — полный приём до разбора');
    ok(env.errs.length === 0, 'новый app.js + старые модули: без ошибок — ' + env.errs.map(String).join(' | '));
  }

  // в) старый app.js (v25) с новыми модулями.
  {
    const env = await boot(fx('app.js') + '?newmods', seedRg);
    ok(!env.crash && env.$w('#continue'), `старый app.js + новые модули: главная открылась${env.crash ? ' — ' + env.crash.message : ''}`);
    env.cw('#continue'); await sleep(10);
    ok(await waitFor(() => [...env.w.document.querySelectorAll('#opts .opt')].some((b) => !b.disabled)),
      'старый app.js + новые модули: «Учиться» — кнопки открываются');
    env.cw('#exit'); await sleep(10);
    ok(await receiveToResult(env, 'short'), 'старый app.js + новые модули: «Короткая» — полный приём до разбора');
    const after = env.st();
    ok(after.settings.radiogramLong === true && after.settings.radiogramGroups === 50,
      'старый app.js + новые модули: выбор «Длинная/50» в хранилище не потерян');
    ok(env.errs.length === 0, 'старый app.js + новые модули: без ошибок — ' + env.errs.map(String).join(' | '));
  }
}

// 12) Нечитаемое состояние, копия которого не легла (квота): основной ключ не затирается,
// а в настройках честная строка (ТЗ, 7.3).
{
  const m = new Map([['boni_m_state', '{"profile": битое']]);
  const store = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (k.startsWith('boni_m_state_broken')) throw new Error('QuotaExceeded'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
  const d = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
  const w = d.window;
  const errs = [];
  w.addEventListener('error', (e) => errs.push(e.error || e.message));
  Object.assign(w, { scrollTo: () => {}, confirm: () => true, alert: () => {}, AudioContext: fakeAudio.AudioContext,
    requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame });
  setGlobal('window', w); setGlobal('document', w.document);
  setGlobal('location', w.location); setGlobal('localStorage', store);
  await import('../app/app.js?blocked');
  await sleep(20);
  const nm = w.document.querySelector('#name');
  nm.value = 'Радист'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.document.querySelector('#next').click(); await sleep(10);
  w.document.querySelector('#start').click(); await sleep(20);
  ok(m.get('boni_m_state') === '{"profile": битое', 'копия не легла — исходная запись не затёрта');
  w.document.querySelector('#gear').click(); await sleep(10);
  ok(w.document.querySelector('#savewarn')?.textContent.includes('Прогресс сейчас не сохраняется'),
    'в настройках: «Прогресс сейчас не сохраняется — напишите автору»');
  ok(errs.length === 0, 'запрет записи: без ошибок — ' + errs.map(String).join(' | '));
}

// 13) «Как пользоваться» (ТЗ-длинные-радиограммы.md, 4.6.8): карточка в настройках есть
// тогда и только тогда, когда задан адрес. Что в этом выпуске он пуст — держит support.test.js.
{
  const { guideUrl } = await import('../app/js/support.js');
  setGlobal('window', window); setGlobal('document', document);
  setGlobal('location', window.location); setGlobal('localStorage', window.localStorage);
  click('[data-tab="home"]'); await sleep(10);
  click('#gear'); await sleep(10);
  const card = document.querySelector('#guide-card');
  ok(!!card === !!guideUrl(), guideUrl() ? 'настройки: карточка «Как пользоваться» есть' : 'настройки: адрес инструкции пуст — карточки нет');
  if (card) {
    const kids = [...document.querySelectorAll('#screen > .card')];
    ok(kids.indexOf(card) === 1, 'карточка «Как пользоваться» — вторая, сразу после «Кто в эфире»');
    ok(card.querySelector('a').getAttribute('href') === guideUrl() && card.querySelector('a').target === '_blank', 'ссылка ведёт на инструкцию, в отдельном окне');
  }
  click('#back'); await sleep(10);
}

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест пройден: ${pass} проверок, ошибок ${errors.length}`);
