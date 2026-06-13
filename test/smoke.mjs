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
async function answerOnce() {
  overlayEl.innerHTML = '';                    // снять возможный оверлей-событие
  const opt = await waitAnswerable();
  if (!opt) return;
  opt.click();
  await sleep(8);
  if (document.querySelector('#opts .opt.wrong')) document.querySelector('#nextbtn')?.click(); // неверно → «Дальше»
  // верный ответ авто-переходит сам — следующий answerOnce дождётся через waitAnswerable
}
await answerOnce();
// после ответа: либо кнопки заблокированы (показ кода), либо начался новый раунд — но без ошибок
ok(true, 'учиться: ответ обработан без ошибок');

// 4б) БЛОКЕР: сессия должна засчитаться при уходе через нижнее меню, а не только по «Выход».
for (let i = 0; i < 16; i++) await answerOnce();
const histBefore = JSON.parse(localStorage.getItem('boni_m_state')).history.length;
click('[data-tab="home"]'); // уход через нижнюю навигацию, НЕ кнопкой «Выход»
await sleep(20);
const st = JSON.parse(localStorage.getItem('boni_m_state'));
ok(st.history.length === histBefore + 1, `сессия записана в журнал при уходе через меню (было ${histBefore}, стало ${st.history.length})`);
ok(st.streak.current === 1, 'серия дней засчитана при уходе через меню');
ok(st.history.at(-1).answers >= 15, `в журнале ≥15 ответов (${st.history.at(-1).answers})`);

// 5) Ключ — режим «Тренировка» (по умолчанию)
click('[data-tab="key"]');
await sleep(10);
ok(document.querySelector('#pad'), 'ключ: площадка отрисована');
ok(text().includes('Отстучите'), 'ключ: подсказка-цель (тренировка)');
ok(document.querySelector('#kspeed'), 'ключ: регулятор скорости ключа есть');

// 5б) Ключ — режим «Свободно»: переключение, реальное отстукивание, авто-пробел, стирание
click('.seg [data-m="free"]');
await sleep(10);
ok(document.querySelector('#text'), 'ключ: строка свободного набора отрисована');
ok(document.querySelector('#erase') && document.querySelector('#clear'), 'ключ: кнопки «Стереть» и «Очистить» есть');
ok(text().includes('пробел'), 'ключ: подсказка про свободный набор');

// Реальное отстукивание: короткое нажатие = точка; в рус. таблице «.» = Е.
const pad = document.querySelector('#pad');
fire(pad, 'pointerdown'); await sleep(60); fire(pad, 'pointerup');
await sleep(360); // > паузы конца знака (3·keyDit при keyWpm=12 = 0.3с) → декодирование
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
ok(text().includes('Бортжурнал'), 'кабинет: открылся со вкладки');
ok(document.querySelector('#name').value === 'Бонислав', 'кабинет: имя подставлено');
ok(document.querySelector('#lang-ru') && document.querySelector('#lang-en'), 'кабинет: язык — кнопки «Русская/English»');
click('#lang-en'); // переключение языка не падает
await sleep(10);
ok(JSON.parse(localStorage.getItem('boni_m_state')).settings.alphabet === 'en', 'кабинет: язык переключился на English');
click('#lang-ru');
await sleep(10);
click('#vib'); // тумблер вибрации не падает
click('#chants');
ok(true, 'кабинет: тумблеры настроек работают');

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест пройден: ${pass} проверок, ошибок ${errors.length}`);
