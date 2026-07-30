// Дымовой тест ОБНОВЛЕНИЯ: приложение запускается на состоянии, записанном прежней версией.
// Это единственное развёртывание, которое реально важно — телефон папы. Обычный smoke.mjs
// начинает с чистого листа и этот путь не проходит вообще.
//
// Запуск: node test/smoke-upgrade.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// Состояние прежней сборки: НЕТ полей lastFirst и settings.theme, и НЕ записаны вехи,
// хотя по числу освоенных знаков они давно заслужены.
const OLD_STATE = {
  version: 2,
  profile: { name: 'Бонислав', callsign: 'Boney M', points: 148 },
  progress: {
    ru: {
      learnedCount: 20, digitsLearned: 0,
      perChar: { 'Е': { correct: 31, total: 34 }, 'Ь': { correct: 9, total: 11 } },
      recent: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      parked: [],
    },
    en: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [] },
  },
  settings: {
    alphabet: 'ru', charWpm: 18, effWpm: 9, keyWpm: 12,
    toneHz: 600, volume: 0.5, showChants: true, vibration: true, keyMode: 'train',
  },
  streak: { current: 4, longest: 7, lastActiveDate: '2026-07-29' },
  totalSeconds: 3420,
  history: [{ date: '2026-07-29', answers: 24, accuracyPct: 87 }],
  milestones: {},
};
window.localStorage.setItem('boni_m_state', JSON.stringify(OLD_STATE));

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
const setGlobal = (k, v) => { try { global[k] = v; } catch {} };
setGlobal('window', window);
setGlobal('document', document);
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
window.AudioContext = undefined;
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};

const text = () => document.querySelector('#screen').textContent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saved = () => JSON.parse(window.localStorage.getItem('boni_m_state'));

await import('../app/app.js');
await sleep(20);

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓', msg); };

// 1) Знакомство заново не предлагается — имя уже есть.
ok(!text().includes('Как вас зовут'), 'онбординг не показан: имя уже сохранено');
ok(text().includes('Бонислав'), 'имя из старого состояния подхвачено');
ok(text().includes('Освоено: 20 из 32'), 'прогресс перенесён без потерь');

// 2) При запуске не выпадает никаких поздравлений.
ok(!document.querySelector('#overlay-root .overlay'), 'при обновлении не выпадает оверлей');

// 3) Заслуженные ранее вехи доначислены ТИХО и записаны в хранилище.
const afterStart = saved();
ok(afterStart.milestones.first4 === true, 'веха «первые 4 знака» доначислена при запуске');
ok(afterStart.milestones.half === true, 'веха «половина алфавита» доначислена при запуске');
ok(afterStart.settings.theme === 'auto', 'тема получила значение «как в телефоне»');

// 4) Первый ответ на занятии не приносит поздравлений за прошлые заслуги.
document.querySelector('[data-tab="learn"]').click();
await sleep(30);
const optsBefore = [...document.querySelectorAll('#opts .opt')];
ok(optsBefore.length === 6, `на большом наборе ровно 6 кнопок (${optsBefore.length})`);

document.querySelector('#overlay-root').innerHTML = '';
for (let i = 0; i < 6; i++) {
  const btn = [...document.querySelectorAll('#opts .opt')].find((b) => !b.disabled);
  if (!btn) { await sleep(40); continue; }
  btn.click();
  await sleep(30);
  const overlay = document.querySelector('#overlay-root .overlay');
  // Открытие нового знака — законное событие. Одинокая «Новая веха!» за прошлые заслуги — нет.
  if (overlay && overlay.textContent.includes('Новая веха')) {
    assert.fail('после обновления выпало поздравление за прошлые заслуги: ' + overlay.textContent.trim());
  }
  document.querySelector('#nextbtn')?.click();
  await sleep(20);
}
ok(true, 'ответы на занятии не приносят поздравлений за прошлые заслуги');

// 5) Первый знак занятия записан — значит в следующий раз начнём с другого.
ok(typeof saved().progress.ru.lastFirst === 'string',
  `знак начала занятия сохранён («${saved().progress.ru.lastFirst}»)`);

assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
console.log(`\nДымовой тест обновления пройден: ${pass} проверок, ошибок ${errors.length}`);
