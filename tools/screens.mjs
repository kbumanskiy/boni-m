// Скриншоты экранов приложения на размере телефона — обе темы.
// Запуск: node tools/screens.mjs [имя-экрана ...]
// Результат: tools/screenshots/<экран>-<тема>.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../app/', import.meta.url).pathname;
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  try {
    const body = await readFile(file);
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

// Как дойти до каждого экрана. Возвращает функцию, которую выполняем на странице.
const SCREENS = {
  home:    async () => {},
  learn:   async (page) => { await page.click('[data-tab="learn"]'); await page.waitForTimeout(900); },
  key:     async (page) => { await page.click('[data-tab="key"]'); await page.waitForTimeout(300); },
  keyfree: async (page) => { await page.click('[data-tab="key"]'); await page.waitForTimeout(200);
                             await page.click('.seg [data-m="free"]'); await page.waitForTimeout(300); },
  ref:     async (page) => { await page.click('[data-tab="ref"]'); await page.waitForTimeout(300); },
  cabinet: async (page) => { await page.click('[data-tab="cabinet"]'); await page.waitForTimeout(300); },
  onboarding: async () => {},
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
  // Вердикт на «Ключе»: отстукиваем одну точку и ждём разбора.
  keyverdict: async (page) => {
    await page.click('[data-tab="key"]'); await page.waitForTimeout(300);
    const pad = page.locator('#pad');
    await pad.dispatchEvent('pointerdown'); await page.waitForTimeout(70);
    await pad.dispatchEvent('pointerup');   await page.waitForTimeout(700);
  },
  // Подсказка с кодами активного набора.
  learnhelp: async (page) => {
    await page.click('[data-tab="learn"]'); await page.waitForTimeout(900);
    await page.click('#help'); await page.waitForTimeout(250);
  },
};

// Автопроверка вёрстки прямо в браузере: обрезанный текст, вылезание за край, мелкий шрифт,
// маленькие кнопки. Глаз это пропускает, замер — нет.
const CHECK_LAYOUT = () => {
  window.checkLayout = () => {
    const out = [];
    const seen = new Set();
    const name = (el) => el.tagName.toLowerCase()
      + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const say = (msg) => { if (!seen.has(msg)) { seen.add(msg); out.push(msg); } };

    for (const el of document.querySelectorAll('#screen *, nav#tabs *, .overlay *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;

      // Обрезанный текст: содержимое шире/выше рамки при скрытом переполнении.
      const clipsX = cs.overflowX !== 'visible', clipsY = cs.overflowY !== 'visible';
      if (el.children.length === 0 && el.textContent.trim()) {
        if (clipsX && el.scrollWidth > el.clientWidth + 1) say(`обрезан текст по ширине: ${name(el)} — «${el.textContent.trim().slice(0, 24)}»`);
        if (clipsY && el.scrollHeight > el.clientHeight + 1) say(`обрезан текст по высоте: ${name(el)} — «${el.textContent.trim().slice(0, 24)}»`);
      }
      // Вылезание за края экрана.
      if (r.left < -1 || r.right > innerWidth + 1) say(`выходит за край экрана: ${name(el)} (${Math.round(r.left)}…${Math.round(r.right)} при ширине ${innerWidth})`);

      // Размер шрифта и площадь нажатия — жёсткие требования доступности.
      const fs = parseFloat(cs.fontSize);
      if (el.textContent.trim() && el.children.length === 0 && fs < 17) say(`мелкий шрифт ${fs}px: ${name(el)}`);
      if ((el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && r.height < 44 && r.height > 0) say(`низкая кнопка ${Math.round(r.height)}px: ${name(el)}`);
    }
    return out;
  };
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
      await ctx.addInitScript((seed) => {
        localStorage.setItem('boni_m_state', JSON.stringify(seed));
      }, SEED);
    }
    await ctx.addInitScript(CHECK_LAYOUT);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    await SCREENS[name](page);
    await page.waitForTimeout(200);

    // Снимаем именно экран телефона, а не всю страницу: fullPage «размазывает» закреплённое
    // нижнее меню и показывает то, чего папа никогда не увидит.
    await page.screenshot({ path: join(OUT, `${name}-${theme}.png`) });
    const problems = await page.evaluate(() => checkLayout());
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
