// Дымовой тест «Звук не включился» (ТЗ-длинные-радиограммы.md, раздел 10.6.4).
//
// Web Audio нет с самого начала (window.AudioContext = undefined). Раньше приложение
// считало каждый знак «прозвучавшим» и тихо засчитывало ответы на то, чего никто не
// слышал. Теперь: честная надпись, кнопки закрыты, ответ не засчитывается. Радиоигра —
// граница правки — работает как раньше.
//
// Запуск: node test/smoke-nosound.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { migrate } from '../app/js/state.js';
import { APP_VERSION } from '../app/js/version.js';
import { makeFakeAudio } from './fake-audio.mjs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

window.localStorage.setItem('boni_m_state', JSON.stringify(migrate({
  profile: { name: 'Радист', callsign: '', points: 0 },
  progress: { ru: { learnedCount: 4 } },
  settings: { knowsAll: true },
  milestones: { first4: true },
})));

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
const setGlobal = (k, v) => { try { global[k] = v; } catch {} };
setGlobal('window', window);
setGlobal('document', document);
setGlobal('location', window.location);
setGlobal('localStorage', window.localStorage);
setGlobal('Event', window.Event);
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
window.confirm = () => true;
window.alert = () => {};
window.scrollTo = () => {};
window.AudioContext = undefined; // звука нет вовсе
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });

await import('../app/app.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(20);

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓', msg); };
const $ = (sel) => document.querySelector(sel);
const click = (sel) => { const el = $(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); };
const text = () => $('#screen').textContent.replace(/\s+/g, ' ');
const saved = () => JSON.parse(window.localStorage.getItem('boni_m_state'));
async function waitFor(cond, ms = 3000) {
  for (let t = 0; t < ms; t += 10) { if (cond()) return true; await sleep(10); }
  return !!cond();
}
const optsOpen = () => [...document.querySelectorAll('#opts .opt')].some((b) => !b.disabled);

// ——— «Учиться»: надпись Б, кнопки закрыты, ответ не засчитывается ———
click('[data-tab="learn"]'); await sleep(20);
ok($('#fb').textContent.includes('В этом браузере нет звука'), '«Учиться»: «В этом браузере нет звука»');
ok($('#fb').textContent.includes('Прогресс там будет свой'), '«Учиться»: предупреждение, что в другом браузере прогресс свой');
ok([...document.querySelectorAll('#opts .opt')].every((b) => b.disabled), '«Учиться»: все кнопки закрыты');
const before = JSON.stringify(saved().progress.ru.perChar);
const counterBefore = $('#counter').textContent;
document.querySelector('#opts .opt').click(); await sleep(10);
ok(JSON.stringify(saved().progress.ru.perChar) === before && $('#counter').textContent === counterBefore,
  '«Учиться»: клик по варианту не меняет статистику знака и счётчик ответов');
click('#exit'); await sleep(10);

// ——— Радиограмма: остановлена, надпись Б, только «Начать заново» ———
click('#radiogram'); await sleep(10);
click('#start'); await sleep(20);
ok(window.__rgDebug.phase === 'stopped', 'радиограмма без звука: передача остановлена');
ok($('#rg-note').textContent.includes('В этом браузере нет звука'), 'радиограмма: надпись Б');
ok($('#rg-restart') && !$('#rg-done') && !$('#rg-part'), 'радиограмма: только «Начать заново», «Готово» нет');
ok(!text().includes('Передача окончена'), 'радиограмма: не «Передача окончена»');
$('#rg-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
await sleep(10);
ok(window.__rgDebug.phase === 'stopped', 'радиограмма: Enter в поле не ведёт на разбор');
click('#abort'); await sleep(10);

// ——— Радиоигра: граница правки — варианты открываются, как раньше ———
click('#puzzle'); await sleep(10);
click('.pz-cat[data-cat="msg"]'); await sleep(10);
click('#pz-listen'); await sleep(20);
ok(document.querySelectorAll('#pz-opts .pz-opt').length === 3, 'Радиоигра без звука: варианты открываются, как раньше');
click('#back'); await sleep(10);
click('#back'); await sleep(10);

// ——— Настройки: версия и «не поддерживается» ———
click('#gear'); await sleep(10);
ok($('#about').textContent.includes(`Версия: ${APP_VERSION}`), `настройки: «Версия: ${APP_VERSION}»`);
ok($('#about').textContent.includes('Звук: не поддерживается'), 'настройки: «Звук: не поддерживается»');
click('#back'); await sleep(10);

// ——— Конструктор звука бросает исключение → надпись А, «не включился» ———
window.AudioContext = class { constructor() { throw new Error('NotAllowedError'); } };
click('[data-tab="learn"]'); await sleep(20);
click('#again'); await sleep(20);
ok($('#fb').textContent.includes('Звук не включился') && $('#fb').textContent.includes('«Послушать ещё раз»'),
  'звук не создался: «Звук не включился… нажмите «Послушать ещё раз»»');
ok(!optsOpen(), 'звук не создался: кнопки закрыты');
click('#gear'); await sleep(10);
ok($('#about').textContent.includes('Звук: не включился'), 'настройки: «Звук: не включился»');
click('#back'); await sleep(10);

// ——— Звук появился → «Послушать ещё раз» открывает кнопки, «работает» ———
window.AudioContext = makeFakeAudio().AudioContext;
click('#again');
ok(await waitFor(optsOpen), 'звук появился: «Послушать ещё раз» — кнопки открылись');
ok(!$('#fb').textContent.includes('Звук не включился'), 'звук появился: надписи больше нет');
click('#gear'); await sleep(10);
ok($('#about').textContent.includes('Звук: работает'), 'настройки: «Звук: работает»');

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест «звука нет» пройден: ${pass} проверок, ошибок ${errors.length}`);
process.exit(0);
