// Скриншоты экранов приложения на размере телефона — обе темы.
// Запуск: node tools/screens.mjs [имя-экрана ...]
// Результат: tools/screenshots/<экран>-<тема>.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { CHECK_LAYOUT } from './page-checks.mjs';

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
  callsign: (s) => {
    s.progress.ru.learnedCount = 33;   // весь алфавит
    s.progress.ru.digitsLearned = 10;  // и цифры — иначе упражнение закрыто
    s.profile.callsign = PUBLIC ? 'DEMO/P' : 'RA9FLC/P';
    delete s.milestones.callsign;      // веха ещё не получена — кнопка на главной видна
    return s;
  },
};

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
};

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
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      colorScheme: theme, reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Онбординг показываем «чистому» состоянию, остальные экраны — с прогрессом.
    if (name !== 'onboarding') {
      const seed = SEED_PATCH[name] ? SEED_PATCH[name](structuredClone(SEED)) : SEED;
      await ctx.addInitScript((s) => {
        localStorage.setItem('boni_m_state', JSON.stringify(s));
      }, seed);
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
