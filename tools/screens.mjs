// Скриншоты экранов приложения на размере телефона — обе темы.
// Запуск: node tools/screens.mjs [имя-экрана ...]
// Результат: tools/screenshots/<экран>-<тема>.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { CHECK_LAYOUT } from './page-checks.mjs';
import * as PZ from '../app/js/puzzle.js';

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
const DEMO_DONATE = 'https://example.org/donate';
const DEMO_FEEDBACK = 'https://example.org/feedback';
// Экраны, которые снимаются с подставленными адресами. Остальные — как в поставке,
// то есть без этих блоков вовсе.
const WITH_LINKS = new Set(['homesupport', 'cabinetsupport', 'cabinetfeedback']);

const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  try {
    let body = await readFile(file);
    if (INJECT_LINKS && path.endsWith('/js/support.js')) {
      body = Buffer.from(String(body)
        .replace("export const DONATE_URL = '';", `export const DONATE_URL = '${DEMO_DONATE}';`)
        .replace("export const FEEDBACK_URL = '';", `export const FEEDBACK_URL = '${DEMO_FEEDBACK}';`));
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('нет файла'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

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
// Главная на маленьком телефоне 360×780: «Продолжить обучение» и плитка Радиоигры
// обязаны стоять целиком выше нижнего меню. Не ослаблять — чинить вёрстку.
const FOLD = new Set(['homepapa360', 'homecall360', 'homenew360']);
// Экраны с чистого листа — без посева прогресса.
const CLEAN = new Set(['onboarding', 'onboardstart']);
// Экраны режима снимаем тоже на 360 точек: самый тесный из телефонов, под который верстаем.
const SMALL = { width: 360, height: 780 };
const VIEWPORT = Object.fromEntries([...FOLD, ...NO_AUDIO, 'onboardstart'].map((n) => [n, SMALL]));

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
  onboarding: async () => {},
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
  // Звук не проснулся (айфон после возврата в приложение): кнопки с буквами закрыты,
  // а подпись зовёт нажать «Послушать ещё раз». Состояние недостижимо кликами — контекст
  // тут обязан НЕ просыпаться, — поэтому ставим подпись напрямую. Проверять надо: длинная
  // подпись переносится на три строки и выдавливает за экран ту самую кнопку, на которую
  // она же и показывает.
  learnsilent: async (page) => {
    await page.click('[data-tab="learn"]'); await page.waitForTimeout(900);
    await page.evaluate(() => {
      const fb = document.querySelector('#fb');
      fb.textContent = 'Нажмите «Послушать ещё раз»';
      fb.className = 'feedback center';
      document.querySelectorAll('#opts .opt').forEach((b) => { b.disabled = true; });
      document.querySelector('#opts').classList.add('playing');
    });
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
  // Вердикт на «Ключе»: отстукиваем одну точку и ждём разбора.
  keyverdict: async (page) => {
    await page.click('[data-tab="key"]'); await page.waitForTimeout(300);
    const pad = page.locator('#pad');
    await pad.dispatchEvent('pointerdown'); await page.waitForTimeout(70);
    await pad.dispatchEvent('pointerup');   await page.waitForTimeout(700);
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

let failures = 0;
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
    const ctx = await browser.newContext({
      viewport: VIEWPORT[name] || { width: 390, height: 844 }, deviceScaleFactor: 2,
      colorScheme: theme, reducedMotion: 'no-preference',
    });
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
    if (NO_AUDIO.has(name)) {
      await ctx.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    }
    await ctx.addInitScript(CHECK_LAYOUT);
    INJECT_LINKS = WITH_LINKS.has(name);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    await SCREENS[name](page);
    await page.waitForTimeout(200);

    // Снимаем именно экран телефона, а не всю страницу: fullPage «размазывает» закреплённое
    // нижнее меню и показывает то, чего папа никогда не увидит.
    await page.screenshot({ path: join(OUT, `${name}-${theme}.png`) });
    const problems = [
      ...await page.evaluate(() => checkLayout()),
      ...await page.evaluate(() => checkA11y()),
    ];
    if (FOLD.has(name)) problems.push(...await foldCheck(page, name));
    if (name.startsWith('home')) problems.push(...await tapCheck(page));
    // Наложение заголовка на кнопки шапки: замер «за край экрана» его не видит.
    problems.push(...await page.evaluate(() => [...document.querySelectorAll('#screen .screenbar')].flatMap((bar) => {
      const h = bar.querySelector('h2'), act = bar.querySelector('.screenbar-actions, .iconbtn');
      if (!h || !act) return [];
      const range = document.createRange(); range.selectNodeContents(h);
      const textRight = Math.max(...[...range.getClientRects()].map((r) => r.right));
      const left = act.getBoundingClientRect().left;
      return textRight > left + 1 ? [`заголовок «${h.textContent.trim()}» заходит под кнопки шапки (${Math.round(textRight)} > ${Math.round(left)})`] : [];
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
console.log('\n✓ вёрстка чистая: ничего не обрезано, не вылезло за край, шрифты и кнопки в норме');
