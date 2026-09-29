// Дымовой тест интерфейса через JSDOM: реальный рендер экранов и клики.
// Ловит ошибки времени выполнения (селекторы, undefined). Звука нет — приложение
// деградирует (playCode без AudioContext сразу вызывает onDone).
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { LIMITS } from '../app/js/timing.js';
import { migrate } from '../app/js/state.js';

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
  click('#pz-listen'); await sleep(10);
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
    click('#pz-listen'); await sleep(5);
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
  click('#pz-listen'); await sleep(5);
  const pics = [...document.querySelectorAll('#pz-opts .pz-pic')];
  ok(pics.length === 3 && pics.every((b) => /^Картинка \d$/.test(b.getAttribute('aria-label')) && !b.textContent.trim()),
    '«Слово»: три картинки без подписей, для диктора — «Картинка N»');
  click('#gear'); await sleep(5);
  ok(text().includes('Настройки'), 'из режима открываются настройки');
  click('#back'); await sleep(10);
  ok(document.querySelectorAll('.pz-cat').length === 4 && hidden(), '«Назад» из настроек — выбор категорий режима, меню спрятано');

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

  // Последним: звук не проснулся (айфон без касания). Модуль звука запоминает контекст,
  // поэтому этот шаг обязан быть последним в файле.
  window.AudioContext = class {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { return new Promise(() => {}); }
  };
  click('[data-tab="home"]'); await sleep(5);
  click('#puzzle'); await sleep(5);
  click('.pz-cat[data-cat="word"]'); await sleep(5);
  click('#pz-listen');
  await sleep(1700);
  ok(!document.querySelector('#pz-opts'), 'звук не проснулся — варианты не открываются');
  ok(document.querySelector('#pz-fb').textContent === 'Нажмите «Слушать» ещё раз.', 'звук не проснулся — «Нажмите «Слушать» ещё раз.»');
}

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест пройден: ${pass} проверок, ошибок ${errors.length}`);
