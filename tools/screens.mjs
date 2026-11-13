// Скриншоты экранов приложения на размере телефона — обе темы.
// Запуск: node tools/screens.mjs [имя-экрана ...]
// Результат: tools/screenshots/<экран>-<тема>.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { CHECK_LAYOUT, NAV_FONT_CSS } from './page-checks.mjs';
import * as PZ from '../app/js/puzzle.js';
import { CODE_BY_CHAR } from '../app/js/data.js';
import { LIMITS } from '../app/js/timing.js';
import { migrate, exportText } from '../app/js/state.js';
import * as MVN from '../app/js/move.js';

const ROOT = new URL('../app/', import.meta.url).pathname;

// SCREENS_PUBLIC=1 — кадры для сайта: нейтральный профиль вместо личного позывного папы
// и отдельная папка, чтобы не затирать эталонные кадры. Обычный запуск не меняется.
const PUBLIC = !!process.env.SCREENS_PUBLIC;
const OUT = new URL(PUBLIC ? './screenshots-public/' : './screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// Блоки «Поддержать» и «Написать автору» показываются, только если в support.js задан
// адрес. В поставке он пуст, поэтому увидеть их иначе нельзя — а непроверенная вёрстка
// доедет до телефона папы. Подставляем адреса на лету, отдавая файл: правим не проект,
// а то, что видит браузер в конкретном кадре.
let INJECT_LINKS = false;
// Переезд (ТЗ-переезд.md, раздел 8): роль адреса подставляется на лету, как адреса выше, а проект
// не правится. 'old' — OLD_HOST/OLD_PATH под localhost; 'new' — NEW_ORIGIN под локальный адрес;
// home — MOVE_HOME = true (главная и знакомство старого адреса). MIXED — state.js прежнего релиза
// (fixtures/v27) для кадра «Приложение ещё обновляется».
let MOVE_CFG = null;
let MIXED = false;
let LOCAL_ORIGIN = '';
const DEMO_DONATE = 'https://example.org/donate';
const DEMO_FEEDBACK = 'https://example.org/feedback';
const DEMO_GUIDE = 'https://example.org/instrukciya/';
// Экраны, которые снимаются с подставленными адресами. Остальные — как в поставке,
// то есть без этих блоков вовсе.
const WITH_LINKS = new Set(['homesupport', 'cabinetsupport', 'cabinetfeedback', 'settingsguide']);

// Шрифт нижнего меню в кадрах — Roboto, как на Android у папы (там system-ui = Roboto).
// Здесь в Chromium system-ui — DejaVu Sans, он на четверть шире: пять подписей меню в нём
// не помещаются на 360 точках ни при какой вёрстке, и кадры показывали бы не то, что на
// телефоне. Подменяем только меню и только в кадрах; остальной текст — в DejaVu, как раньше
// (он шире, значит проверка вёрстки страницы строже настоящей). Правило — NAV_FONT_CSS.
const FONTS = new URL('./fonts/', import.meta.url).pathname;
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (path.startsWith('/__fonts/')) {
    try { const body = await readFile(join(FONTS, normalize(path.slice(9))));
      res.writeHead(200, { 'content-type': 'font/woff2' }); return res.end(body);
    } catch { res.writeHead(404); return res.end(); }
  }
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  try {
    let body = await readFile(file);
    if (INJECT_LINKS && path.endsWith('/js/support.js')) {
      body = Buffer.from(String(body)
        .replace("export const DONATE_URL = '';", `export const DONATE_URL = '${DEMO_DONATE}';`)
        .replace("export const FEEDBACK_URL = '';", `export const FEEDBACK_URL = '${DEMO_FEEDBACK}';`)
        .replace("export const GUIDE_URL = '';", `export const GUIDE_URL = '${DEMO_GUIDE}';`));
    }
    if (MOVE_CFG && path.endsWith('/js/move.js')) {
      let src = String(body);
      if (MOVE_CFG.role === 'new') src = src.replace("export const NEW_ORIGIN = 'https://app.morse73.ru';", `export const NEW_ORIGIN = '${LOCAL_ORIGIN}';`);
      if (MOVE_CFG.role === 'old') src = src.replace("export const OLD_HOST = 'kbumanskiy.github.io';", "export const OLD_HOST = '127.0.0.1';")
        .replace("export const OLD_PATH = '/boni-m/';", "export const OLD_PATH = '/';");
      if (MOVE_CFG.home) src = src.replace('export const MOVE_HOME = false;', 'export const MOVE_HOME = true;');
      body = Buffer.from(src);
    }
    if (MIXED && path.endsWith('/js/state.js')) body = await readFile(join(ROOT, '../fixtures/v27/state.js'));
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('нет файла'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
LOCAL_ORIGIN = base.slice(0, -1);

// Состояние «папа уже позанимался» — чтобы экраны были не пустыми, а живыми.
const SEED = {
  version: 2,
  profile: { name: 'Бонислав', callsign: 'Boney M', points: 148 },
  progress: {
    ru: { learnedCount: 9, digitsLearned: 0, parked: [], lastFirst: 'Н',
          recent: [1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1],
          perChar: { 'Е':{correct:31,total:34}, 'Т':{correct:28,total:30}, 'И':{correct:26,total:29},
                     'М':{correct:24,total:27}, 'А':{correct:19,total:22}, 'Н':{correct:17,total:20},
                     'С':{correct:14,total:17}, 'О':{correct:11,total:13}, 'У':{correct:5,total:7} } },
    en: { learnedCount: 0, digitsLearned: 0, perChar: {}, recent: [], parked: [], lastFirst: null },
  },
  settings: { alphabet: 'ru', charWpm: 18, effWpm: 9, keyWpm: 12, toneHz: 600, volume: 0.5,
              showChants: true, vibration: true, keyMode: 'train', theme: 'auto' },
  streak: { current: 4, longest: 7, lastActiveDate: '2026-07-30' },
  totalSeconds: 3420,
  history: [
    { date: '2026-07-26', answers: 22, accuracyPct: 82 },
    { date: '2026-07-27', answers: 19, accuracyPct: 89 },
    { date: '2026-07-28', answers: 26, accuracyPct: 91 },
    { date: '2026-07-29', answers: 24, accuracyPct: 87 },
    { date: '2026-07-30', answers: 20, accuracyPct: 94 },
  ],
  milestones: { first4: true, tenMin: true },
};

// Публичный профиль для сайта. Позывной DEMO выбран намеренно: он не может совпасть
// с чьим-то настоящим позывным, а личный позывной папы на публичной странице не место.
if (PUBLIC) SEED.profile = { name: 'Радист', callsign: 'DEMO', points: 148 };

// Отдельным экранам нужно своё состояние. Менять его на странице бесполезно: при каждой
// навигации initScript кладёт исходное обратно, — поэтому правим сам посев до запуска.
const SEED_PATCH = {
  // Контрольная радиограмма открывается после двадцати знаков. Даём весь алфавит
  // и цифры: иначе не снять ни выбор «Цифры», ни смешанный текст.
  radiogram: (s) => { s.progress.ru.learnedCount = 33; s.progress.ru.digitsLearned = 10; return s; },
  radiogramwork: (s) => SEED_PATCH.radiogram(s),
  radiogramresult: (s) => SEED_PATCH.radiogram(s),
  // Напевы латиницы (ТЗ-латинские-напевы.md, §6): латинский курс целиком — 26 букв и все
  // цифры (одного learnedCount=26 мало: набор — префикс смешанного порядка, без C, D, X).
  learnwrongen: (s) => { s.settings.alphabet = 'en'; s.progress.en = { learnedCount: 26, digitsLearned: 10, perChar: {}, recent: [], parked: [], lastFirst: null }; return s; },
  learnhelpen: (s) => SEED_PATCH.learnwrongen(s),
  // Русский курс целиком (с Ъ) на 360 точках — для сравнения с латинским списком.
  learnhelpru: (s) => { s.progress.ru.learnedCount = 32; s.progress.ru.digitsLearned = 10; return s; },
  // Открытие нового знака: трек готов открыть следующий по первому верному ответу.
  // После 20 латинских букв порядок чередует буквы и цифры: …, D, 4, X, 5 — открывается X.
  learnnewen: (s) => { s.settings.alphabet = 'en';
    s.progress.en = { learnedCount: 25, digitsLearned: 5, perChar: { '4': { correct: 6, total: 6 } },
      recent: Array(20).fill(1), parked: [], lastFirst: null }; return s; },
  learnnewendigit: (s) => { SEED_PATCH.learnnewen(s); s.progress.en.learnedCount = 26;
    s.progress.en.perChar = { X: { correct: 6, total: 6 } }; return s; },
  // Длинная радиограмма: подготовка снимается кликом по «Длинной», остальные — уже с выбором 50.
  radiogramlong: (s) => SEED_PATCH.radiogram(s),
  radiogramlong390: (s) => SEED_PATCH.radiogram(s),
  // «Длина тире» на самой длинной подписи — «заметно длиннее» (ТЗ-длина-тире.md, раздел 5).
  settingsdah: (s) => { s.settings.dahRatio = 4; return s; },
  settingsdah390: (s) => SEED_PATCH.settingsdah(s),
  // Самая быстрая скорость знака (самое длинное значение «NNN зн/мин» + WPM) — в крупном шрифте.
  settingsfast: (s) => { s.settings.charWpm = LIMITS.charWpm.max; return s; },
  // «Напевы букв» — три положения (v29): выбрано «Другие слова», карточка на виду.
  settingschants: (s) => { s.settings.chantSet = 'alt'; s.settings.showChants = true; return s; },
  // Карточка знака Й во втором наборе — самый длинный напев этого набора у буквы.
  refcardalt: (s) => SEED_PATCH.settingschants(s),
  radiogramall: (s) => SEED_PATCH.radiogram(s),
  radiogramlongwork: (s) => { SEED_PATCH.radiogram(s); s.settings.radiogramLong = true; s.settings.radiogramGroups = 50; return s; },
  radiogramlongresult: (s) => SEED_PATCH.radiogramlongwork(s),
  // Обрыв: на 225 зн/мин первая полная группа звучит за пару секунд.
  radiogramlongstopped: (s) => { SEED_PATCH.radiogramlongwork(s); s.settings.radiogramCpm = 225; return s; },
  callsign: (s) => {
    s.progress.ru.learnedCount = 33;   // весь алфавит
    s.progress.ru.digitsLearned = 10;  // и цифры — иначе упражнение закрыто
    s.profile.callsign = PUBLIC ? 'DEMO/P' : 'RA9FLC/P';
    delete s.milestones.callsign;      // веха ещё не получена — кнопка на главной видна
    return s;
  },
};

// ——— Радиоигра ———
// Колода подставляется так, чтобы выпал нужный вопрос: в круге «уже показаны» все,
// кроме него. Так снимки повторяемы и берут самые трудные для вёрстки случаи.
const forceQ = (s, cat, id) => {
  s.puzzle = { isNew: false };
  s.puzzle[cat] = { seen: PZ.idsOf(cat).filter((x) => x !== id), last: null, solved: [] };
  return s;
};
// Папа: весь алфавит и цифры, открыта радиограмма, приложение стояло до обновления
// (пометка «Новое»), веха позывного уже получена — разовой кнопки нет.
const papa = (s) => {
  s.progress.ru.learnedCount = 32; s.progress.ru.digitsLearned = 10;
  s.milestones = { ...s.milestones, callsign: true };
  s.puzzle = { isNew: true };
  return s;
};
Object.assign(SEED_PATCH, {
  homepapa360: papa,
  // Та же главная с разовой кнопкой «Принять свой позывной»: самый тесный случай.
  homecall360: (s) => { papa(s); delete s.milestones.callsign; return s; },
  homecall: (s) => { papa(s); delete s.milestones.callsign; return s; },
  // Новичок в первый день: четыре знака, ни серии, ни журнала, пометки «Новое» нет.
  homenew360: (s) => {
    s.profile = { ...s.profile, callsign: '', points: 0 };
    s.progress.ru = { learnedCount: 4, digitsLearned: 0, parked: [], lastFirst: null, recent: [], perChar: {} };
    s.streak = { current: 0, longest: 0, lastActiveDate: null };
    s.totalSeconds = 0; s.history = []; s.milestones = { first4: true };
    s.puzzle = { isNew: false };
    return s;
  },
  puzzlecats: (s) => { s.puzzle = { isNew: false, word: { seen: [], last: null, solved: ['w01', 'w02', 'w05'] },
    story: { seen: [], last: null, solved: ['s01'] } }; return s; },
  puzzleq:      (s) => forceQ(s, 'riddle', 'r08'),   // самый длинный текст каталога
  puzzleqwrong: (s) => forceQ(s, 'msg', 'm09'),      // самые длинные варианты «Сообщения»
  puzzleqpics:  (s) => forceQ(s, 'word', 'w25'),
  puzzlecode:   (s) => forceQ(s, 'story', 's15'),    // РАДИОЛЮБИТЕЛЬ — самое длинное слово
  puzzlereveal: (s) => forceQ(s, 'word', 'w30'),
  puzzlestory:  (s) => forceQ(s, 'story', 's05'),    // самый длинный рассказ Бони
  puzzleend:    (s) => { s.puzzle = { isNew: false }; return s; },
});

// Экраны режима снимаются БЕЗ звука: иначе история в 30 знаков звучит полминуты на
// каждый вопрос. Приложение без Web Audio считает сигнал прозвучавшим — как в JSDOM.
const NO_AUDIO = new Set(['puzzlecats', 'puzzleq', 'puzzleqwrong', 'puzzleqpics', 'puzzlecode',
  'puzzlereveal', 'puzzlestory', 'puzzleend']);
// Разбор длинной радиограммы ждёт конца передачи: 50 групп в настоящем Chromium звучали бы
// минутами. Поэтому — ускоренный поддельный контекст (как test/fake-audio.mjs, ×1000).
// Только для разбора: у «приёма» и «обрыва» передача обязана ещё идти в момент снимка.
const FAST_AUDIO = new Set(['radiogramlongresult', 'learnnewen', 'learnnewendigit']);
// «Спящий» звук: контекст есть, но не просыпается (айфон без касания) — кадр learnsilent.
const SLEEPY_AUDIO = new Set(['learnsilent']);
const SLEEPY_AUDIO_SCRIPT = () => {
  class Sleepy { constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { return new Promise(() => {}); } close() { return Promise.resolve(); } }
  window.AudioContext = Sleepy; window.webkitAudioContext = Sleepy;
};
const FAST_AUDIO_SCRIPT = () => {
  class Param { constructor() { this.value = 0; } setValueAtTime(v) { this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; } cancelScheduledValues() { return this; } }
  class Node { connect(n) { return n; } disconnect() {} }
  class Fast {
    constructor() { this.state = 'running'; this.t0 = performance.now(); this.destination = new Node(); }
    get currentTime() { return 1 + (performance.now() - this.t0); } // мс как секунды — ×1000
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    // Журнал тонов (window.__tones): по нему сценарий «слушает» знак — восстанавливает код
    // по длительностям, как человек на слух. Подсказки ответа в приложении нет.
    createOscillator() {
      const rec = { freq: 0, start: 0, dur: 0 };
      const osc = Object.assign(new Node(), { type: 'sine', frequency: new Param(), onended: null,
        start(t) { rec.freq = osc.frequency.value; rec.start = t; (window.__tones ||= []).push(rec); },
        stop(t) { if (t !== undefined && !rec.dur) rec.dur = t - 0.01 - rec.start; } });
      return osc;
    }
    createGain() { return Object.assign(new Node(), { gain: new Param() }); }
  }
  window.AudioContext = Fast; window.webkitAudioContext = Fast;
};
// Главная на маленьком телефоне 360×780: «Продолжить обучение» и плитка Радиоигры
// обязаны стоять целиком выше нижнего меню. Не ослаблять — чинить вёрстку.
const FOLD = new Set(['homepapa360', 'homecall360', 'homenew360']);
// Экраны с чистого листа — без посева прогресса.
const CLEAN = new Set(['onboarding', 'onboarding360', 'onboarding320', 'onboardstart']);
// Экраны режима снимаем тоже на 360 точек: самый тесный из телефонов, под который верстаем.
const SMALL = { width: 360, height: 780 };
const VIEWPORT = Object.fromEntries([...FOLD, ...NO_AUDIO, 'onboardstart',
  // Длинная радиограмма: на узком телефоне выше риск вылезти за край.
  'radiogramlong', 'radiogramlongwork', 'radiogramlongresult', 'radiogramlongstopped',
  // «Звук не включился» на самом тесном телефоне.
  'learnsilent', 'onboarding360',
  // Напевы латиницы: самые длинные подписи (X/Ь) — на 360 точках.
  'learnwrongen', 'learnhelpen', 'learnhelpru', 'refcarden', 'refcardendigit', 'learnnewen', 'learnnewendigit',
  // «Длина тире»: карточка «Скорость» на самом тесном телефоне.
  'settingsdah',
  // Наборы напевов (v29): выбор в настройках и карточка знака во втором наборе.
  'settingschants', 'refcardalt',
].map((n) => [n, SMALL]));
// Первый экран с полем имени: Android 360 и самый тесный 320 (здесь поле заезжало на подпись).
VIEWPORT.onboarding320 = { width: 320, height: 640 };

// Верный ответ на вопрос, который сейчас на экране: id берём из сохранённой колоды.
async function rightAnswer(page, cat) {
  const last = await page.evaluate((c) => JSON.parse(localStorage.getItem('boni_m_state')).puzzle[c].last, cat);
  return PZ.qById(cat, last).right;
}
async function puzzleOpen(page, cat) {
  await page.click('#puzzle'); await page.waitForTimeout(200);
  await page.click(`.pz-cat[data-cat="${cat}"]`); await page.waitForTimeout(200);
}
async function puzzleListen(page) {
  await page.click('#pz-listen'); await page.waitForSelector('#pz-opts button', { timeout: 5000 });
}
async function puzzleSolve(page, cat) {
  await puzzleListen(page);
  const right = await rightAnswer(page, cat);
  await page.click(`#pz-opts button[data-o="${right}"]`); await page.waitForTimeout(200);
}

// Как дойти до каждого экрана. Возвращает функцию, которую выполняем на странице.
const SCREENS = {
  home:    async () => {},
  learn:   async (page) => { await page.click('[data-tab="learn"]'); await page.waitForTimeout(900); },
  key:     async (page) => { await page.click('[data-tab="key"]'); await page.waitForTimeout(300); },
  keyfree: async (page) => { await page.click('[data-tab="key"]'); await page.waitForTimeout(200);
                             await page.click('.seg [data-m="free"]'); await page.waitForTimeout(300); },
  ref:     async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(300); },
  cabinet: async (page) => { await page.click('[data-tab="cabinet"]'); await page.waitForTimeout(300); },
  // Настройки уехали из «Журнала» на свой экран — снимать обязательно: именно там
  // теперь живут выбор азбуки, скорость знака в зн/мин, тон и резервная копия.
  settings: async (page) => { await page.click('[data-tab="cabinet"]'); await page.waitForTimeout(200);
                              await page.click('#gear'); await page.waitForTimeout(300); },
  // «Я уже знаю азбуку»: кнопка и раскрытое подтверждение (на странице, не окном).
  // Карточка ниже первого экрана — прокручиваем к ней, иначе снимок её не покажет.
  // Карточка «Скорость» с «Длиной тире»: в обычный кадр settings она не попадает — прокрутка.
  settingsdah: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                 await page.evaluate(() => document.querySelector('#ldah').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  settingsdah390: async (page) => SCREENS.settingsdah(page),
  settingschants: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                    await page.evaluate(() => document.querySelector('#chants').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  refcardalt: async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
                                await page.click('.cell[data-c="Й"]'); await page.waitForTimeout(250); },
  settingsfast: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                  await page.evaluate(() => document.querySelector('#lchar').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  settingsknows: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                   await page.evaluate(() => document.querySelector('#knows-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  settingsknowsask: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                      await page.click('#knows'); await page.waitForTimeout(200);
                                      await page.evaluate(() => document.querySelector('#knows-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  settingsknowson: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                     await page.click('#knows'); await page.waitForTimeout(200);
                                     await page.click('#knows-yes'); await page.waitForTimeout(200);
                                     await page.evaluate(() => document.querySelector('#knows-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  // «Вернуть по умолчанию»: при значениях по умолчанию кнопки нет, поэтому сначала двигаем высоту тона (короткая подпись: у быстрой скорости знака в крупном шрифте подпись шире карточки — старое замечание, см. отчёт).
  settingsrecask: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
                                    await page.evaluate(() => { const r = document.querySelector('#tone'); r.value = 800; r.dispatchEvent(new Event('input', { bubbles: true })); });
                                    await page.waitForTimeout(200);
                                    await page.click('#rec'); await page.waitForTimeout(200);
                                    await page.evaluate(() => document.querySelector('#rec-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); },
  onboarding: async () => {},
  onboarding360: async () => {},
  onboarding320: async () => {},
  // Первый вход: знакомство → «Начать занятие» открывает само занятие на четырёх знаках
  // (раньше — главную с «Продолжить обучение», хотя ни одного знака ещё не было).
  onboardstart: async (page) => {
    await page.fill('#name', 'Бонислав'); await page.click('#next'); await page.waitForTimeout(200);
    await page.click('#start'); await page.waitForTimeout(900);
  },
  // Вкладки «Азбуки»: цифры и знаки препинания. Их отсутствие здесь и было дырой в проверке —
  // обрезанный столбец жил на экранах, которые ни разу не снимались.
  refdigits: async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
                               await page.click('[data-s="digits"]'); await page.waitForTimeout(250); },
  refpunct:  async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
                               await page.click('[data-s="punct"]'); await page.waitForTimeout(250); },
  refen:     async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
                               await page.click('[data-a="en"]'); await page.waitForTimeout(250); },
  refcard:   async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
                               await page.click('.cell'); await page.waitForTimeout(250); },
  // Звук не проснулся (айфон после возврата в приложение): кнопки с буквами закрыты, под
  // лампой «Звук не включился» и пояснение. Состояние настоящее: контекст подменён на
  // «спящий» (SLEEPY_AUDIO), и приложение само приходит к надписи через 1,5 с. Проверять
  // надо на 360×780: длинная надпись не должна выдавить за меню ту самую кнопку, на которую
  // она показывает, и сетку букв (свой замер — checkAboveNav в page-checks.mjs).
  learnsilent: async (page) => {
    await page.click('[data-tab="learn"]');
    await page.waitForFunction(() => /Звук не включился/.test(document.querySelector('#fb')?.textContent || ''), null, { timeout: 5000 });
    await page.waitForTimeout(200);
  },
  // Разбор ошибки: жмём варианты, пока не попадётся неверный — это состояние надо видеть.
  learnwrong: async (page) => {
    await page.click('[data-tab="learn"]'); await page.waitForTimeout(900);
    for (let i = 0; i < 12; i++) {
      const btn = page.locator('#opts .opt:not([disabled])').first();
      if (!(await btn.count())) { await page.waitForTimeout(400); continue; }
      await btn.click(); await page.waitForTimeout(250);
      if (await page.locator('#nextbtn').count()) return;
      await page.waitForTimeout(500);
    }
  },
  // Упражнение «Свой позывной». Снимать обязательно: позывной берётся из профиля,
  // и длина у него любая. Берём заведомо трудный — RA9FLC/P: восемь знаков, цифра
  // и дробная черта (её проиграть нечем, она должна молча выпасть из радиограммы),
  // а под ним — дорожка из восьми кодов, которой очень легко вылезти за край экрана.
  callsign: async (page) => {
    await page.click('#drill');
    await page.waitForTimeout(300);
  },
  // Контрольная радиограмма: три состояния — подготовка, приём и разбор. Разбор
  // снимаем с заведомо испорченным ответом: именно там цветные пометки, длинная
  // строка групп и риск вылезти за край экрана.
  radiogram: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(300);
  },
  // «Всё вместе» выбрано: подпись третьей кнопки и подсказка под выбором.
  radiogramall: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('[data-kind="mixed"]'); await page.waitForTimeout(250);
    if (!(await page.locator('[data-kind="mixed"].active').count())) throw new Error('radiogramall: «Всё вместе» не выбрано');
  },
  radiogramwork: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('#start'); await page.waitForTimeout(400);
    await page.fill('#rg-input', 'ЖЕЛЕЗ ОКНАМ');
    await page.waitForTimeout(200);
  },
  radiogramresult: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('#start'); await page.waitForTimeout(400);
    // Отвечаем «почти правильно»: берём переданный текст и портим его — одна замена,
    // один пропуск, один лишний знак. Так на снимке видны все три вида пометок.
    await page.evaluate(() => {
      const sent = window.__rgText || '';
      const plain = sent.replace(/\s+/g, '');
      const spoiled = plain.slice(0, 3) + 'Щ' + plain.slice(5, 12) + 'Ж' + plain.slice(13);
      document.querySelector('#rg-input').value = spoiled;
    });
    await page.click('#rg-done'); await page.waitForTimeout(400);
  },
  // Длинная радиограмма (ТЗ-длинные-радиограммы.md, раздел 5). Сценарии ждут состояния,
  // а не времени; не то состояние перед снимком — ошибка прогона, а не кадр «как получилось».
  radiogramlong: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('[data-dur="long"]'); await page.waitForTimeout(250);
    if (!(await page.locator('[data-groups]').count())) throw new Error('radiogramlong: нет ряда «Сколько групп»');
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
  },
  // То же на обычных 390 точках: там сегмент «Длительность» — прежним кеглем.
  radiogramlong390: async (page) => SCREENS.radiogramlong(page),
  radiogramlongwork: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('#start');
    await page.waitForFunction(() => window.__rgDebug && window.__rgDebug.played >= 1, null, { timeout: 15000 });
    await page.fill('#rg-input', 'ЖЕЛЕЗ ОКНАМ');
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ phase: window.__rgDebug.phase, ended: window.__rgDebug.ended,
      left: !!document.querySelector('#rg-left'), rows: document.querySelector('#rg-input').rows }));
    if (st.phase !== 'receive' || st.ended || !st.left || st.rows !== 6) throw new Error('radiogramlongwork: не то состояние ' + JSON.stringify(st));
  },
  radiogramlongresult: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('#start');
    await page.waitForFunction(() => window.__rgDebug && window.__rgDebug.ended === true, null, { timeout: 20000 });
    // Ошибки всех видов в разных группах плюс вставка в 100 знаков посередине:
    // разбор обязан остаться в пределах экрана, и ни одна группа не рвётся.
    await page.evaluate(() => {
      const p = (window.__rgText || '').replace(/\s+/g, '');
      const other = (ch) => (ch === 'Ж' ? 'Х' : 'Ж');
      const spoiled = p.slice(0, 7) + other(p[7]) + p.slice(8, 31) + p.slice(32, 60) + 'Q'.repeat(100)
        + p.slice(60, 88) + 'Щ' + p.slice(88, 140) + other(p[140]) + p.slice(141);
      document.querySelector('#rg-input').value = spoiled;
    });
    await page.click('#rg-done'); await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ groups: document.querySelectorAll('.rg-group').length,
      errs: !!document.querySelector('#rg-errors'), verdict: !!document.querySelector('.verdict') }));
    if (st.groups !== 50 || !st.errs || st.verdict) throw new Error('radiogramlongresult: не то состояние ' + JSON.stringify(st));
    // Кадр — на стыке разбора и списка «Где ошибки»: видны и группы, и номера групп.
    await page.evaluate(() => document.querySelector('#rg-errors')?.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(200);
  },
  radiogramlongstopped: async (page) => {
    await page.click('#radiogram'); await page.waitForTimeout(250);
    await page.click('#start');
    await page.waitForFunction(() => window.__rgDebug && window.__rgDebug.played >= 6, null, { timeout: 15000 });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({ phase: window.__rgDebug.phase, part: !!document.querySelector('#rg-part'),
      restart: !!document.querySelector('#rg-restart'), done: !!document.querySelector('#rg-done') }));
    if (st.phase !== 'stopped' || !st.part || !st.restart || st.done) throw new Error('radiogramlongstopped: не то состояние ' + JSON.stringify(st));
  },
  // Вердикт на «Ключе»: отстукиваем одну точку и ждём разбора.
  keyverdict: async (page) => {
    await page.click('[data-tab="key"]'); await page.waitForTimeout(300);
    const pad = page.locator('#pad');
    await pad.dispatchEvent('pointerdown'); await page.waitForTimeout(70);
    await pad.dispatchEvent('pointerup');   await page.waitForTimeout(700);
  },
  // Карточка «Как пользоваться» — видна только с подставленным адресом (WITH_LINKS). Подмена
  // работает по точному тексту «= '';»: не сработала — карточки нет, и это ошибка прогона.
  settingsguide: async (page) => {
    await page.click('#gear'); await page.waitForTimeout(300);
    if (!(await page.locator('#guide-card').count())) throw new Error('settingsguide: карточки #guide-card нет — подмена адреса не сработала');
    await page.evaluate(() => document.querySelector('#guide-card').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
  },
  // Блоки поддержки и обратной связи — видны только с заданными адресами (см. WITH_LINKS).
  homesupport: async () => {},
  cabinetsupport: async (page) => {
    await page.click('[data-tab="cabinet"]'); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.support')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
  },
  cabinetfeedback: async (page) => {
    await page.click('[data-tab="cabinet"]'); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#feedback')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
  },
  // Напевы латиницы: разбор ошибки, список кодов (до строки X/Ь), карточки «Азбуки»,
  // открытие нового знака. Русский список целиком — для сравнения на тех же 360 точках.
  learnwrongen: async (page) => SCREENS.learnwrong(page),
  learnhelpen: async (page) => {
    await page.click('[data-tab="learn"]'); await page.waitForTimeout(900);
    await page.click('#help'); await page.waitForTimeout(250);
    if (!(await page.locator('#chant-legend').count())) throw new Error('learnhelpen: нет легенды двойников');
    await page.evaluate(() => [...document.querySelectorAll('#help-box li')].find((li) => li.querySelector('b')?.textContent === 'X')
      ?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
  },
  learnhelpru: async (page) => {
    await page.click('[data-tab="learn"]'); await page.waitForTimeout(900);
    await page.click('#help'); await page.waitForTimeout(250);
    await page.evaluate(() => [...document.querySelectorAll('#help-box li')].find((li) => li.querySelector('b')?.textContent === 'Ъ')
      ?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
  },
  refcarden: async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
    await page.click('[data-a="en"]'); await page.waitForTimeout(200);
    await page.click('.cell[data-c="X"]'); await page.waitForTimeout(250); },
  refcardendigit: async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(200);
    await page.click('[data-a="en"]'); await page.waitForTimeout(200);
    await page.click('[data-s="digits"]'); await page.waitForTimeout(200);
    await page.click('.cell[data-c="8"]'); await page.waitForTimeout(250); },
  learnnewen: async (page) => learnOpenNew(page, 'X'),
  learnnewendigit: async (page) => learnOpenNew(page, '5'),
  // Подсказка с кодами активного набора.
  learnhelp: async (page) => {
    await page.click('[data-tab="learn"]'); await page.waitForTimeout(900);
    await page.click('#help'); await page.waitForTimeout(250);
  },
  // Главная в трёх состояниях на телефоне 360×780 (см. FOLD).
  homepapa360: async () => {},
  homecall360: async () => {},
  homecall: async () => {},   // то же на обычных 390 точках: круг света там шире
  homenew360: async () => {},
  // Радиоигра: категории, вопрос текстом и картинками, неверный ответ, точки-тире
  // с азбукой, разгадка «Слова» и истории, итог раунда.
  puzzlecats: async (page) => { await page.click('#puzzle'); await page.waitForTimeout(250); },
  puzzleq: async (page) => { await puzzleOpen(page, 'riddle'); await puzzleListen(page); await page.waitForTimeout(150); },
  puzzleqwrong: async (page) => {
    await puzzleOpen(page, 'msg'); await puzzleListen(page);
    const right = await rightAnswer(page, 'msg');
    await page.click(`#pz-opts button:not([data-o="${right}"])`); await page.waitForTimeout(250);
  },
  puzzleqpics: async (page) => { await puzzleOpen(page, 'word'); await puzzleListen(page); await page.waitForTimeout(150); },
  puzzlecode: async (page) => {
    await puzzleOpen(page, 'story');
    await page.click('#pz-code'); await page.waitForTimeout(150);
    await page.click('#pz-abc'); await page.waitForTimeout(150);
  },
  puzzlereveal: async (page) => { await puzzleOpen(page, 'word'); await puzzleSolve(page, 'word'); },
  puzzlestory: async (page) => { await puzzleOpen(page, 'story'); await puzzleSolve(page, 'story'); },
  puzzleend: async (page) => {
    await puzzleOpen(page, 'msg');
    for (let i = 0; i < 5; i++) {
      await puzzleListen(page);
      // Две из пяти — со второй попытки: на итоге видны обе краски кружков.
      if (i === 1 || i === 3) {
        const right = await rightAnswer(page, 'msg');
        await page.click(`#pz-opts button:not([data-o="${right}"])`); await page.waitForTimeout(100);
      }
      const right = await rightAnswer(page, 'msg');
      await page.click(`#pz-opts button[data-o="${right}"]`); await page.waitForTimeout(100);
      await page.click('#pz-next'); await page.waitForTimeout(150);
    }
  },
};

// ——— Экран «Учиться» на всех ширинах (чистка наложений, 20.10.2026) ———
// Каждое состояние занятия — вопрос, «Верно!», разбор ошибки, «Повторение», подсказка —
// снимается на 390 (без суффикса), 360, 320 и с крупным системным шрифтом (big):
// Android при шрифте 130% увеличивает страницу, и телефон 360 точек вмещает только
// 277 точек вёрстки — их и даём, с той же физической чёткостью.
SCREENS.learnright = async (page) => {
  await page.click('[data-tab="learn"]');
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => [...document.querySelectorAll('#opts .opt')].some((b) => !b.disabled), null, { timeout: 5000 });
    const c = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('boni_m_state')).settings;
      const dit = 1.2 / st.charWpm;
      const mine = (window.__tones || []).filter((t) => t.freq === st.toneHz && t.dur > 0);
      const chain = [mine.at(-1)];
      for (let k = mine.length - 2; k >= 0; k--) {
        const p = mine[k], q = chain[0];
        if (Math.abs(p.start + p.dur + dit - q.start) < 1e-6) chain.unshift(p); else break;
      }
      return chain.map((t) => (t.dur > 2 * dit ? '-' : '.')).join('');
    });
    const ch = REV_RU[c];
    if (ch && await page.locator(`#opts .opt[data-c="${ch}"]`).count()) {
      await page.click(`#opts .opt[data-c="${ch}"]`);
      await page.waitForFunction(() => document.querySelector('#fb')?.textContent === 'Верно!', null, { timeout: 1000 });
      return;
    }
    throw new Error(`learnright: не распознан знак по звуку (${c})`);
  }
};
SCREENS.learnrep = async (page) => { await page.click('#review'); await page.waitForTimeout(900);
  if ((await page.locator('#screen .screenbar h2').textContent()) !== 'Повторение') throw new Error('learnrep: не «Повторение»'); };
const LEARN_SIZES = { 360: { width: 360, height: 780 }, 320: { width: 320, height: 640 }, big: { width: 277, height: 600 } };
for (const base of ['learn', 'learnright', 'learnwrong', 'learnrep', 'learnhelp']) {
  for (const [suf, vp] of Object.entries(LEARN_SIZES)) {
    SCREENS[base + suf] = SCREENS[base];
    VIEWPORT[base + suf] = vp;
    if (base === 'learnright') FAST_AUDIO.add(base + suf);
  }
}
FAST_AUDIO.add('learnright');
// ——— Остальные экраны на тех же ширинах (чистка наложений, 23.10.2026) ———
// Главная, Ключ, Азбука, Журнал, настройки, «Свой позывной», радиограмма и Радиоигра —
// на 360, 320 и с крупным шрифтом. Посев, звук и подставленные адреса — как у основного кадра.
// Экраны, которые и так снимаются на 360 (Радиоигра), получают только 320 и big.
for (const base of ['home', 'homecall', 'key', 'keyfree', 'keyverdict', 'ref', 'refdigits', 'refpunct', 'refen', 'refcard',
  'cabinet', 'settings', 'settingsfast', 'settingsknows', 'settingsrecask', 'settingschants', 'refcardalt', 'callsign', 'radiogram', 'radiogramall', 'radiogramresult', 'radiogramlongresult',
  'puzzlecats', 'puzzleq', 'puzzleqwrong', 'puzzlecode', 'puzzlereveal',
  // Подсказка «Учиться» со всем алфавитом: самые длинные напевы (русские и латинские).
  'learnhelpru', 'learnhelpen']) {
  for (const [suf, vp] of Object.entries(LEARN_SIZES)) {
    if (VIEWPORT[base] && VIEWPORT[base].width === vp.width) continue;
    const name = base + suf;
    SCREENS[name] = SCREENS[base];
    VIEWPORT[name] = vp;
    if (SEED_PATCH[base]) SEED_PATCH[name] = SEED_PATCH[base];
    for (const set of [NO_AUDIO, FAST_AUDIO, SLEEPY_AUDIO, WITH_LINKS]) if (set.has(base)) set.add(name);
  }
}
// Компьютер (критерий 6: меню по ширине содержимого, а не от края до края экрана).
for (const base of ['home', 'learn', 'ref']) { SCREENS[base + 'pc'] = SCREENS[base]; VIEWPORT[base + 'pc'] = { width: 1280, height: 800 }; }
// Чёткость кадра: «крупный шрифт» — тот же телефон 360 точек, увеличенный в 1,3 раза.
const SCALE = (name) => (name.endsWith('big') ? 2.6 : 2);
const REV_RU = Object.fromEntries([...CODE_BY_CHAR.ru].map(([c, k]) => [k, c]));

// Открыть новый знак: ответить верно на первый же вопрос. Цель «слышим» по журналу тонов
// ускоренного поддельного звука (FAST_AUDIO) — цепочка тонов последнего знака.
const REV_EN = Object.fromEntries([...CODE_BY_CHAR.en].map(([c, k]) => [k, c]));
async function learnOpenNew(page, want) {
  await page.click('[data-tab="learn"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#opts .opt')].some((b) => !b.disabled), null, { timeout: 5000 });
  const code = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('boni_m_state')).settings;
    const dit = 1.2 / st.charWpm;
    const mine = (window.__tones || []).filter((t) => t.freq === st.toneHz && t.dur > 0);
    const chain = [mine.at(-1)];
    for (let i = mine.length - 2; i >= 0; i--) {
      const p = mine[i], c = chain[0];
      if (Math.abs(p.start + p.dur + dit - c.start) < 1e-6) chain.unshift(p); else break;
    }
    return chain.map((t) => (t.dur > 2 * dit ? '-' : '.')).join('');
  });
  await page.click(`#opts .opt[data-c="${REV_EN[code]}"]`);
  await page.waitForFunction((w) => (document.querySelector('#overlay-root h2')?.textContent || '').includes(`Открыт новый знак: ${w}`), want, { timeout: 3000 });
}

// Первый экран главной: где кончаются «Продолжить» и плитка относительно верхнего края меню.
// Печатаем числа всегда — это замер для отчёта, а не только приговор.
async function foldCheck(page, name) {
  const m = await page.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    return { nav: Math.round(document.querySelector('nav#tabs').getBoundingClientRect().top),
      cont: box('#continue'), tile: box('#puzzle'), review: box('#review'),
      label: document.querySelector('#continue')?.textContent.trim(), hasReview: !!document.querySelector('#review'),
      drill: !!document.querySelector('#drill'), radiogram: !!document.querySelector('#radiogram'),
      pill: !!document.querySelector('#puzzle .pill-new'), scrollY: Math.round(scrollY) };
  });
  const out = [];
  const span = (b) => (b ? `${b.top}–${b.bottom}` : 'нет');
  console.log(`    ↳ 360×780: меню с ${m.nav}; «${m.label}» ${span(m.cont)}; плитка ${span(m.tile)}; «Повторение» ${span(m.review)}`
    + `${m.drill ? '; есть «Принять свой позывной»' : ''}${m.pill ? '; пометка «Новое»' : ''}`);
  if (m.scrollY !== 0) out.push(`замер первого экрана не с верха страницы (прокрутка ${m.scrollY})`);
  if (!m.cont || m.cont.bottom > m.nav) out.push(`кнопка обучения «${m.label}» уходит под нижнее меню (${span(m.cont)}, меню с ${m.nav})`);
  if (!m.tile || m.tile.bottom > m.nav) out.push(`плитка «Радиоигра» уходит под нижнее меню (${span(m.tile)}, меню с ${m.nav})`);
  // Состояние обязано быть тем, которое проверяем, — иначе зелёный замер ничего не значит.
  // Новичок до первого ответа: «Начать обучение» и без «Повторения» — повторять нечего.
  const want = { homepapa360: { drill: false, radiogram: true, pill: true, label: 'Продолжить обучение', hasReview: true },
    homecall360: { drill: true, radiogram: true, pill: true, label: 'Продолжить обучение', hasReview: true },
    homenew360: { drill: false, radiogram: false, pill: false, label: 'Начать обучение', hasReview: false } }[name];
  for (const k of Object.keys(want)) if (m[k] !== want[k]) out.push(`состояние главной не то: ${k}=${m[k]}, ждали ${want[k]}`);
  return out;
}

// Кнопки главной обязаны нажиматься по всей площади. Круг света за портретом шире самого
// блока и однажды перехватывал касания у верхней кромки «Принять свой позывной» (390 точек):
// снимок этого не показывает, а палец промахивается. Точки под нижним меню не проверяем.
async function tapCheck(page) {
  return page.evaluate(() => {
    const navTop = document.querySelector('nav#tabs').getBoundingClientRect().top;
    return ['#drill', '#radiogram', '#continue', '#puzzle', '#review'].flatMap((sel) => {
      const e = document.querySelector(sel); if (!e) return [];
      const r = e.getBoundingClientRect();
      return [[r.left + 12, r.top + 3], [r.left + r.width / 2, r.top + 3], [r.right - 12, r.top + 3],
        [r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.bottom - 3]]
        .filter(([, y]) => y > 0 && y < navTop)
        .filter(([x, y]) => !e.contains(document.elementFromPoint(x, y)))
        .map(([x, y]) => { const hit = document.elementFromPoint(x, y);
          return `касание по ${sel} в (${Math.round(x)},${Math.round(y)}) уходит в ${hit ? hit.tagName.toLowerCase() + (hit.className ? '.' + hit.className : '') : 'пустоту'}`; });
    });
  });
}


// ——— Переезд на app.morse73.ru: кадры (ТЗ-переезд.md, раздел 8) ———
// Все — 360×780 в обеих темах; ключевые — ещё на 320 и при крупном шрифте (…320, …big).
// Роль адреса — MOVE_FRAMES; что лежит в хранилище/сессии, какой телефон и какой фрагмент в адресе — MOVE_EXTRA.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const OLD_ROLE = { role: 'old', home: true }, NEW_ROLE = { role: 'new' };
const MOVE_FRAMES = {
  moveoldhome: OLD_ROLE, moveoldsettings: OLD_ROLE, moveoldios: OLD_ROLE, moveoldafter: OLD_ROLE, moveoldstale: OLD_ROLE,
  moveoldfresh: OLD_ROLE, moveoldonbprogress: OLD_ROLE,
  movenewconfirm: NEW_ROLE, movenewcompare: NEW_ROLE, movenewdone: NEW_ROLE, movenewpaste: NEW_ROLE, movenewsettings: NEW_ROLE,
  restorelist: NEW_ROLE, onboardingnew: NEW_ROLE, restoreconfirm: NEW_ROLE, movenewalready: NEW_ROLE, movenewdoneios: NEW_ROLE,
  movenewmixed: NEW_ROLE,
};
// Что пришло со старого адреса, и что уже лежит у человека (сравнение: здесь прогресса больше).
const incomingBig = () => migrate({ ...structuredClone(SEED), profile: { name: 'Бонислав', callsign: '', points: 412 },
  progress: { ru: { ...SEED.progress.ru, learnedCount: 27, digitsLearned: 6 }, en: SEED.progress.en }, totalSeconds: 18000 });
const incomingSmall = () => migrate({ profile: { name: 'Вася', callsign: '', points: 12 },
  progress: { ru: { learnedCount: 4, digitsLearned: 0, perChar: { 'Е': { correct: 3, total: 4 } }, recent: [], parked: [], lastFirst: null } },
  history: [{ date: '2026-11-01', answers: 4, accuracyPct: 75 }] });
const answersOf = (st) => MVN.answersOf(migrate(st));
const slotItems = () => [0, 1, 2].map((i) => ({ at: ['2026-10-18', '2026-10-05', '2026-09-20'][i],
  state: JSON.stringify(migrate({ ...structuredClone(SEED), profile: { ...SEED.profile, name: ['Бонислав', 'Бонислав', 'Борис Петрович'][i], points: [412, 260, 40][i] },
    progress: { ru: { ...SEED.progress.ru, learnedCount: [27, 20, 6][i] }, en: SEED.progress.en }, totalSeconds: [18000, 9000, 1200][i] })) }));
const withCode = async (st) => `#perenos=${await MVN.encodeTransfer(exportText(st), { date: '20261018' })}`;
const MOVE_EXTRA = {
  moveoldafter: async () => ({ store: { boni_m_moved: JSON.stringify({ at: '2026-10-18', secs: SEED.totalSeconds, answers: answersOf(SEED) }) } }),
  moveoldstale: async () => ({ store: { boni_m_moved: JSON.stringify({ at: '2026-10-18', secs: SEED.totalSeconds - 3000, answers: answersOf(SEED) - 60 }) } }),
  moveoldios: async () => ({ ua: IPHONE, standalone: true }),
  movenewconfirm: async () => ({ hash: await withCode(incomingBig()) }),
  movenewcompare: async () => ({ hash: await withCode(incomingSmall()) }),
  movenewalready: async () => ({ hash: await withCode(migrate(SEED)) }),
  movenewmixed: async () => ({ hash: await withCode(incomingBig()) }),
  movenewdone: async () => ({ ua: ANDROID, session: { boni_m_moved_ok: '1' } }),
  movenewdoneios: async () => ({ ua: IPHONE, session: { boni_m_moved_ok: '1' } }),
  restorelist: async () => ({ store: { boni_m_state_before_move: JSON.stringify(slotItems()) } }),
};
const moveKey = (name) => name.replace(/(320|big)$/, '');
const scrollTo = (sel, block = 'center') => (page) => page.evaluate(([q, b]) => document.querySelector(q).scrollIntoView({ block: b }), [sel, block]);
const linkReady = (page) => page.waitForFunction(() => /^(A)$/.test(document.querySelector('#m-go')?.tagName || ''), null, { timeout: 5000 });
const oldHome = async (page) => { await linkReady(page); await scrollTo('#move-card')(page); await page.waitForTimeout(150); };
Object.assign(SCREENS, {
  moveoldhome: oldHome,
  moveoldsettings: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
    await page.waitForFunction(() => { const b = document.querySelector('#m-copy'); return b && !b.disabled; }, null, { timeout: 5000 });
    await scrollTo('#move-card', 'start')(page); await page.waitForTimeout(150); },
  moveoldios: oldHome, moveoldafter: oldHome, moveoldstale: oldHome,
  moveoldfresh: async () => {},
  moveoldonbprogress: async (page) => { await linkReady(page); },
  movenewconfirm: async (page) => { await page.waitForSelector('#mv-confirm'); },
  movenewcompare: async (page) => { await page.waitForSelector('#mv-confirm'); },
  movenewdone: async (page) => { await page.waitForSelector('#m-done'); },
  movenewdoneios: async (page) => { await page.waitForSelector('#m-done'); },
  movenewpaste: async (page) => { await page.click('#m-have'); await page.waitForSelector('#m-code');
    const code = await MVN.encodeTransfer(exportText(incomingBig()), { date: '20261018' });
    await page.fill('#m-code', code.slice(0, code.length - 70)); await page.click('#m-check');
    await page.waitForFunction(() => document.querySelector('#m-err')?.textContent, null, { timeout: 3000 }); },
  movenewsettings: async (page) => { await page.click('#gear'); await page.waitForTimeout(300); await scrollTo('#m-new-card')(page); await page.waitForTimeout(150); },
  restorelist: async (page) => { await page.click('#gear'); await page.waitForTimeout(300); await page.click('#m-undo'); await page.waitForTimeout(200);
    await scrollTo('#m-versions', 'start')(page); await page.waitForTimeout(150); },
  onboardingnew: async () => {},
  restoreconfirm: async (page) => { await page.click('#gear'); await page.waitForTimeout(300);
    await page.setInputFiles('#file', { name: 'копия.json', mimeType: 'application/json', buffer: Buffer.from(exportText(incomingBig())) });
    await page.waitForSelector('#mv-confirm'); },
  movenewalready: async (page) => { await page.waitForSelector('#mv-confirm'); await page.click('#mv-yes'); await page.waitForSelector('#mv-msg'); },
  movenewmixed: async (page) => { await page.waitForSelector('#mv-msg'); },
});
Object.assign(SEED_PATCH, {
  // Знакомство открылось, а прогресс есть: имя стёрто в настройках.
  moveoldonbprogress: (s) => { s.profile.name = ''; return s; },
  // Для «Восстановить из копии» без своего прогресса: после знакомства, ни одного ответа.
  restoreconfirm: () => ({ version: 2, profile: { name: 'Бонислав', callsign: '', points: 0 } }),
});
for (const n of ['moveoldfresh', 'movenewpaste', 'onboardingnew', 'movenewmixed', 'movenewconfirm']) CLEAN.add(n);
for (const n of Object.keys(MOVE_FRAMES)) VIEWPORT[n] = SMALL;
// Те же кадры на 320 и при крупном шрифте.
for (const base of ['moveoldhome', 'moveoldsettings', 'moveoldios', 'movenewconfirm', 'movenewcompare', 'movenewpaste', 'restorelist', 'movenewdone']) {
  for (const suf of ['320', 'big']) {
    const n = base + suf;
    SCREENS[n] = SCREENS[base]; VIEWPORT[n] = LEARN_SIZES[suf];
    if (SEED_PATCH[base]) SEED_PATCH[n] = SEED_PATCH[base];
    if (CLEAN.has(base)) CLEAN.add(n);
  }
}

// Экраны, вычищенные от наложений: на них ничего не выходит из карточки или клетки.
const INSIDE_CARDS = ['learn', 'ref', 'key', 'puzzle', 'home', 'cabinet', 'settings', 'radiogram', 'callsign', 'onboarding', 'move', 'restore'];
let failures = 0, labelPairs = 0, labelStates = 0;
const want = process.argv.slice(2);
const list = want.length ? want.filter((n) => n in SCREENS) : Object.keys(SCREENS);
// В этом окружении в кэше Playwright лежит другая сборка Chromium, чем ждёт библиотека —
// берём ту, что реально установлена, вместо падения с «Executable doesn't exist».
async function launch() {
  const args = ['--autoplay-policy=no-user-gesture-required']; // иначе звук не стартует и кнопки остаются гашёными
  try { return await chromium.launch({ args }); } catch (e) {
    const { glob } = await import('node:fs/promises');
    for await (const p of glob('/root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome')) {
      return await chromium.launch({ executablePath: p, args });
    }
    throw e;
  }
}
const browser = await launch();

for (const theme of ['light', 'dark']) {
  for (const name of list) {
    const mk = moveKey(name);
    MOVE_CFG = MOVE_FRAMES[mk] || null;
    MIXED = mk === 'movenewmixed';
    const extra = MOVE_EXTRA[mk] ? await MOVE_EXTRA[mk]() : {};
    const ctx = await browser.newContext({
      viewport: VIEWPORT[name] || { width: 390, height: 844 }, deviceScaleFactor: SCALE(name),
      colorScheme: theme, reducedMotion: 'no-preference', ...(extra.ua ? { userAgent: extra.ua } : {}),
    });
    // Хранилище, сессия и «значок на экране» — только тем кадрам, которым они нужны.
    if (extra.store) await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, extra.store);
    if (extra.session) await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) if (!sessionStorage.getItem('__seen_' + k)) { sessionStorage.setItem(k, v); sessionStorage.setItem('__seen_' + k, '1'); } }, extra.session);
    if (extra.standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Онбординг показываем «чистому» состоянию, остальные экраны — с прогрессом.
    if (!CLEAN.has(name)) {
      const seed = SEED_PATCH[name] ? SEED_PATCH[name](structuredClone(SEED)) : SEED;
      await ctx.addInitScript((s) => {
        localStorage.setItem('boni_m_state', JSON.stringify(s));
      }, seed);
    }
    if (FAST_AUDIO.has(name)) await ctx.addInitScript(FAST_AUDIO_SCRIPT);
    if (SLEEPY_AUDIO.has(name)) await ctx.addInitScript(SLEEPY_AUDIO_SCRIPT);
    if (NO_AUDIO.has(name)) {
      await ctx.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    }
    await ctx.addInitScript(CHECK_LAYOUT);
    await ctx.addInitScript((css) => document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style'); st.textContent = css; document.head.append(st); }), NAV_FONT_CSS);
    INJECT_LINKS = WITH_LINKS.has(name);
    await page.goto(base + (extra.hash || ''), { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    await page.evaluate(() => document.fonts.ready);
    // Сценарий, не дошедший до нужного состояния, — ошибка прогона, а не кадр «как получилось».
    try { await SCREENS[name](page); } catch (e) { errors.push('сценарий: ' + e.message); }
    await page.waitForTimeout(200);

    // Снимаем именно экран телефона, а не всю страницу: fullPage «размазывает» закреплённое
    // нижнее меню и показывает то, чего папа никогда не увидит.
    await page.screenshot({ path: join(OUT, `${name}-${theme}.png`) });
    const problems = [
      ...await page.evaluate(() => checkLayout()),
      ...await page.evaluate(() => checkA11y()),
    ];
    // Подпись и поле/кнопки одного блока не должны наезжать друг на друга (см. checkLabels).
    const lab = await page.evaluate(() => checkLabels());
    labelPairs += lab.pairs; if (lab.pairs) labelStates++;
    problems.push(...lab.problems);
    if (FOLD.has(name)) problems.push(...await foldCheck(page, name));
    // Все буквы ответа — над нижним меню, и на 320, и при крупном шрифте (меню там в два ряда).
    if (/^learn(wrong)?(320|big)?$/.test(name)) problems.push(...await page.evaluate(() => checkAboveNav(['#opts .opt:last-child'])));
    if (name === 'learnsilent') problems.push(...await page.evaluate(() => checkAboveNav(['#again', '#opts .opt:last-child'])));
    // Вычищенные экраны: ничего не торчит из карточки (разбор ошибки) или клетки (Азбука).
    if (INSIDE_CARDS.some((p) => name.startsWith(p))) problems.push(...await page.evaluate(() => checkInsideCards()));
    // «Дальше» на обычных телефонах — в первом экране, не под нижним меню.
    if (name === 'learnwrong' || name === 'learnwrong360') problems.push(...await page.evaluate(() => checkAboveNav(['#nextbtn'])));
    // Нижнее меню: подписи не слипаются и не выходят из кнопок, на компьютере — по содержимому.
    problems.push(...await page.evaluate(() => checkNav()));
    problems.push(...await page.evaluate(() => checkImageEdges()));
    problems.push(...await page.evaluate(() => checkCodeWrap()));
    problems.push(...await page.evaluate(() => checkSmall()));
    // Новые элементы переезда — не ниже 64px, включая ссылки-кнопки (РЕШЕНИЯ.md, «Постоянные требования», п. 5).
    problems.push(...await page.evaluate(() => checkMoveTargets()));
    if (name.startsWith('home')) problems.push(...await tapCheck(page));
    if (/^(home|onboarding|callsign)/.test(name)) problems.push(...await page.evaluate(() => checkHeroGlow()));
    // Наложение заголовка на кнопки шапки: замер «за край экрана» его не видит.
    problems.push(...await page.evaluate(() => [...document.querySelectorAll('#screen .screenbar')].flatMap((bar) => {
      const h = bar.querySelector('h2'), act = bar.querySelector('.screenbar-actions, .iconbtn');
      if (!h || !act) return [];
      const range = document.createRange(); range.selectNodeContents(h);
      const rects = [...range.getClientRects()];
      const textRight = Math.max(...rects.map((r) => r.right));
      const a = act.getBoundingClientRect(), left = a.left;
      // Кнопки, ушедшие строкой ниже заголовка (шапка «Учиться» на узком экране), не мешают ему.
      const sameRow = rects.some((r) => r.bottom > a.top + 1 && r.top < a.bottom - 1);
      return sameRow && textRight > left + 1 ? [`заголовок «${h.textContent.trim()}» заходит под кнопки шапки (${Math.round(textRight)} > ${Math.round(left)})`] : [];
    })));
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 4);
    if (scrollable) {
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(OUT, `${name}-${theme}-низ.png`) });
    }
    const bad = errors.length || problems.length;
    console.log(`${bad ? '✗' : '✓'} ${name}-${theme}${scrollable ? ' (+низ)' : ''}`
      + (errors.length ? ` — ОШИБКИ: ${errors.join(' | ')}` : '')
      + (problems.length ? `\n    ⚠ ${problems.join('\n    ⚠ ')}` : ''));
    if (bad) failures++;
    await ctx.close();
  }
}
await browser.close();
server.close();
if (failures) { console.error(`\n✗ экранов с замечаниями: ${failures}`); process.exit(1); }
console.log(`\nподписи и поля: измерено ${labelPairs} пар в ${labelStates} кадрах`);
console.log('\n✓ вёрстка чистая: ничего не обрезано, не вылезло за край, шрифты и кнопки в норме');
