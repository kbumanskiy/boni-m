// Дымовой тест ОБНОВЛЕНИЯ с v25 на v26 (ТЗ-длинные-радиограммы.md, 4.8).
// Тот же каркас, что smoke-upgrade.mjs, но состояние — ровно то, что пишет v25:
// опытный пользователь с «Я уже знаю азбуку», рекордом радиограммы, вехами, отложенным
// знаком, латинским треком, Радиоигрой, тёмной темой и выключенной статистикой.
// Снимок пропущен через migrate настоящего кода v25 (fixtures/v25/state.js) —
// значит, это ровно то, что лежит в хранилище у людей.
//
// Запуск: node test/smoke-upgrade-v25.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { makeFakeAudio } from './fake-audio.mjs';
import * as V25 from '../fixtures/v25/state.js';
import { MILESTONES } from '../app/js/gamify.js';
import { LIMITS } from '../app/js/timing.js';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
const def25 = V25.defaultState();
const MS = ['first4', 'tenMin', 'radiogram', 'callsign', 'half'];
for (const k of MS) assert.ok(MILESTONES[k], `веха ${k} есть в каталоге`);

const V25_STATE = V25.migrate({
  version: 2,
  profile: { name: 'Бонислав', callsign: 'Boney M', points: 412 },
  progress: {
    ru: { learnedCount: 27, digitsLearned: 6,
          perChar: { 'Е': { correct: 31, total: 34 }, 'Ь': { correct: 4, total: 11 }, 'Щ': { correct: 6, total: 8 } },
          recent: [1, 1, 0, 1, 1, 1, 1, 0, 1, 1], parked: [{ char: 'Ь', returnAt: 30 }], lastFirst: 'Щ' },
    en: { learnedCount: 6, digitsLearned: 0, perChar: { 'K': { correct: 9, total: 10 } }, recent: [1, 1, 1], parked: [], lastFirst: 'E' },
  },
  settings: { alphabet: 'ru', charWpm: 20, effWpm: 12, keyWpm: 14, toneHz: 700, volume: 0.6,
    showChants: false, vibration: true, answerSound: false, keyMode: 'free',
    radiogramCpm: 110, radiogramKind: 'mixed', radiogramFull: true,
    theme: 'dark', metrics: false, knowsAll: true },
  streak: { current: 9, longest: 21, lastActiveDate: yesterday },
  records: { radiogramCpm: 100 },
  totalSeconds: 18000,
  history: [{ date: '2026-10-13', answers: 22, accuracyPct: 88 }, { date: '2026-10-15', answers: 31, accuracyPct: 91 },
    { date: yesterday, answers: 25, accuracyPct: 94 }],
  milestones: Object.fromEntries(MS.map((k) => [k, true])),
  puzzle: { ...structuredClone(def25.puzzle), word: { seen: ['w01', 'w05'], last: 'w05', solved: ['w01'] }, isNew: false },
});
assert.equal(V25_STATE.settings.radiogramLong, undefined, 'снимок без полей v26');
window.localStorage.setItem('boni_m_state', JSON.stringify(V25_STATE));

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
const setGlobal = (k, v) => { try { global[k] = v; } catch {} };
setGlobal('window', window);
setGlobal('document', document);
setGlobal('location', window.location);
setGlobal('localStorage', window.localStorage);
setGlobal('Blob', window.Blob);
setGlobal('Event', window.Event);
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
window.confirm = () => true;
window.alert = () => {};
window.scrollTo = () => {};
window.AudioContext = makeFakeAudio().AudioContext;
const sentOut = [];
global.fetch = async (url, opts = {}) => {
  sentOut.push({ url: String(url), body: String(opts.body || '') });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

await import('../app/app.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(30);

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓', msg); };
const $ = (sel) => document.querySelector(sel);
const click = (sel) => { const el = $(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); };
const text = () => $('#screen').textContent.replace(/\s+/g, ' ');
const saved = () => JSON.parse(window.localStorage.getItem('boni_m_state'));

ok(!text().includes('Как вас зовут'), 'онбординга нет');
ok($('#radiogram'), 'на главной «Контрольная радиограмма»');
ok(!$('#overlay-root .overlay'), 'поздравлений при запуске нет');
ok(document.documentElement.dataset.theme === 'dark', 'тема тёмная, как была');

// После загрузки все поля снимка — прежние, плюс два новых с умолчаниями.
{
  const now = saved();
  const want = structuredClone(V25_STATE);
  want.settings.radiogramLong = false;
  want.settings.radiogramGroups = LIMITS.radiogramGroups.def;
  // Старт записывает знак начала занятия только при входе в «Учиться» — здесь его не было.
  assert.deepEqual(now, want);
  ok(true, 'состояние v25 перенесено без потерь: все поля прежние + radiogramLong=false, radiogramGroups=30');
}

click('#radiogram'); await sleep(10);
ok(text().includes('110 зн/мин'), 'подготовка: 110 зн/мин');
ok($('[data-kind="mixed"]').classList.contains('active'), 'подготовка: «Смесь»');
ok($('[data-dur="minute"]').classList.contains('active') && !$('[data-groups]'), 'подготовка: активна «Минута», ряда групп нет');
ok(text().includes('Лучшая принятая радиограмма: 100 зн/мин'), '«Лучшая принятая радиограмма: 100 зн/мин»');

// Полный путь «Длинная» → 20 групп → разбор → «Выйти».
click('[data-dur="long"]'); await sleep(10);
click(`[data-groups="${LIMITS.radiogramGroups.options[0]}"]`); await sleep(10);
click('#start');
for (let t = 0; t < 8000 && !window.__rgDebug.ended; t += 10) await sleep(10);
ok(window.__rgDebug.ended, 'длинная: передача дозвучала');
ok((window.__rgText || '').split(' ').length === LIMITS.radiogramGroups.options[0], 'длинная: 20 групп');
$('#rg-input').value = (window.__rgText || '').replace(/\s+/g, '').slice(3);
click('#rg-done'); await sleep(10);
ok(text().includes('Тренировка') && text().includes('Верно:'), 'разбор тренировки с процентом');
click('#leave'); await sleep(10);
ok(saved().records.radiogramCpm === 100 && saved().profile.points === 412, 'рекорд 100 и очки 412 не изменились');
ok(MS.every((k) => saved().milestones[k] === true) && Object.keys(saved().milestones).length === MS.length, 'вехи те же');
ok(saved().settings.radiogramFull === true, 'radiogramFull не тронут выбором «Длинной»');

// Журнал.
click('[data-tab="cabinet"]'); await sleep(10);
ok(/Лучшая радиограмма\s*100 зн\/мин/.test(text()), 'Журнал: «Лучшая радиограмма 100 зн/мин»');

// Латинский трек на месте.
click('#gear'); await sleep(10);
click('#lang-en'); await sleep(10);
ok(saved().settings.alphabet === 'en' && saved().progress.en.learnedCount === 6, 'латинский трек: освоено 6');
ok(saved().progress.ru.learnedCount === 27 && saved().progress.ru.parked.length === 1
  && saved().progress.ru.parked[0].char === 'Ь', 'русский трек: 27 знаков, отложенная Ь на месте');
click('#lang-ru'); await sleep(10);

// Статистика выключена — наружу ничего.
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
document.dispatchEvent(new window.Event('visibilitychange'));
await sleep(20);
ok(!sentOut.some((r) => r.url.endsWith('/ping')), 'статистика выключена — наружу ничего не уходило');

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест обновления с v25 пройден: ${pass} проверок, ошибок ${errors.length}`);
process.exit(0);
