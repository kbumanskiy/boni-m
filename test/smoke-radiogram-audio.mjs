// Дымовой тест радиограммы с УПРАВЛЯЕМЫМ звуком (ТЗ-длинные-радиограммы.md, 4.6, пункты 6–7а).
//
// В обычном smoke передача на быстром поддельном звуке проходит за доли секунды, а без
// Web Audio onDone приходит сразу — состояния «передача идёт», которое держится, пока
// велит тест, так не получить. Здесь часы аудио стоят, пока их не передвинет сам тест,
// а кадры анимации прокручиваются вручную. Состояние читается через window.__rgDebug.
//
// Запуск: node test/smoke-radiogram-audio.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { migrate } from '../app/js/state.js';
import { makeFakeAudio } from './fake-audio.mjs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// Опытный радист («Я уже знаю азбуку»), до вехи «10 минут в эфире» — полсекунды.
const SEED = migrate({
  profile: { name: 'Радист', callsign: '', points: 77 },
  progress: { ru: { learnedCount: 4 } },
  settings: { knowsAll: true, radiogramCpm: 225, radiogramKind: 'letters', radiogramLong: true, radiogramGroups: 20 },
  records: { radiogramCpm: 90 },
  milestones: { first4: true },
  totalSeconds: 599.6,
});
window.localStorage.setItem('boni_m_state', JSON.stringify(SEED));

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
const setGlobal = (k, v) => { try { global[k] = v; } catch {} };
setGlobal('window', window);
setGlobal('document', document);
setGlobal('location', window.location);
setGlobal('localStorage', window.localStorage);
setGlobal('Event', window.Event);
// Кадры анимации — вручную: так onChar/onDone наступают, когда велит тест.
const frames = [];
global.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
global.cancelAnimationFrame = () => {};
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
window.confirm = () => true;
window.alert = () => {};
window.scrollTo = () => {};
const fake = makeFakeAudio({ manual: true });
window.AudioContext = fake.AudioContext;
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
const dbg = () => window.__rgDebug;
// Передвинуть часы аудио и прокрутить накопившиеся кадры.
function advance(dt) {
  if (fake.last) fake.last.currentTime += dt;
  const pending = frames.splice(0);
  for (const cb of pending) cb(performance.now());
}
async function advanceUntil(cond, step = 0.05, max = 4000) {
  for (let i = 0; i < max && !cond(); i++) advance(step);
  await sleep(0);
  return cond();
}
const hide = async (hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new window.Event('visibilitychange'));
  await sleep(5);
};
const enter = () => $('#rg-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const openSetup = async () => { click('#radiogram'); await sleep(5); };

ok($('#radiogram'), 'главная: «Контрольная радиограмма» на месте');
const before = saved();

// ——— «Длинная»: «Готово» до начала звука ничего не делает ———
await openSetup();
ok($('[data-dur="long"]').classList.contains('active'), 'подготовка: выбрана «Длинная» из сохранённого');
click('#start'); await sleep(5);
ok(dbg().phase === 'receive' && dbg().played === 0, 'приём начат, ни одного знака ещё не прозвучало');
click('#rg-done'); await sleep(5);
ok(dbg().phase === 'receive' && $('#rg-note').textContent.includes('Передача ещё не началась'),
  '«Готово» до начала звука: «Передача ещё не началась», приём продолжается');

// ——— Enter во время передачи не завершает приём ———
advance(0.2);
ok(await advanceUntil(() => dbg().played >= 2), 'передача идёт: прозвучали первые знаки');
enter(); await sleep(5);
ok(dbg().phase === 'receive', 'Enter во время передачи ничего не делает');

// ——— Обрыв посреди «Длинной» после первой группы: разбор по прозвучавшей части ———
ok(await advanceUntil(() => dbg().played >= 6), 'прозвучала первая полная группа и ещё знак');
await sleep(600); // чтобы активное время пересекло порог вехи «10 минут в эфире»
const heard = dbg().played;
await hide(true);
ok(dbg().phase === 'stopped', 'свернули посреди «Длинной» — передача остановлена');
ok($('#rg-note').textContent.includes('Передача прервана: приложение сворачивали'), 'заметка «Передача прервана…»');
ok($('#rg-part') && $('#rg-restart') && !$('#rg-done'), '«Разобрать принятое» и «Начать заново», «Готово» нет');
await hide(false);
advance(5);
ok(dbg().phase === 'stopped' && dbg().played === heard, 'после возврата передача сама не продолжается');
enter(); await sleep(5);
ok(dbg().phase === 'stopped', 'Enter в фазе «остановлено» ничего не делает');
const plainLong = window.__rgText.replace(/\s+/g, '');
$('#rg-input').value = plainLong.slice(0, heard);
click('#rg-part'); await sleep(5);
ok(dbg().phase === 'result', '«Разобрать принятое» открывает разбор');
ok(text().includes('приём закончили раньше'), 'заголовок: «…приём закончили раньше»');
ok(text().includes(`Ошибок: 0 из ${heard}`), `разбор ровно по прозвучавшим знакам (${heard})`);
ok(text().includes('Верно: 100%'), 'принятое без ошибок — 100%');
// Веха «10 минут в эфире»: время засчитано, а поздравления посреди тренировки нет.
const mid = saved();
ok(mid.totalSeconds >= 600, `время приёма вошло во «Всего в эфире» (${mid.totalSeconds.toFixed(1)} с)`);
ok(!mid.milestones.tenMin && !$('#overlay-root .overlay'), 'веха «10 минут» не выпала посреди разбора длинной');
ok(mid.profile.points === before.profile.points && mid.records.radiogramCpm === before.records.radiogramCpm,
  'длинная: очки и рекорд не изменились');

// ——— «Начать заново» даёт новый текст ———
click('#again'); await sleep(5);
const t1 = window.__rgText;
ok(await advanceUntil(() => dbg().played >= 1), 'новая передача пошла');
await hide(true);
ok(!$('#rg-part') && $('#rg-restart'), 'обрыв до конца первой группы: только «Начать заново»');
await hide(false);
click('#rg-restart'); await sleep(5);
ok(dbg().phase === 'receive' && window.__rgText !== t1, '«Начать заново» — новый текст, снова приём');

// ——— «Длинная», «Готово» раньше конца без сворачивания — тоже по прозвучавшей части ———
ok(await advanceUntil(() => dbg().played >= 12), 'прозвучало больше двух групп');
const heard2 = dbg().played;
$('#rg-input').value = '';
click('#rg-done'); await sleep(5);
ok(text().includes(`Ошибок: ${heard2} из ${heard2}`), `«Готово» раньше конца: разбор ${heard2} прозвучавших знаков`);
click('#leave'); await sleep(5);

// ——— «Минута»: обрыв посреди звука — только «Начать заново» ———
await openSetup();
click('[data-dur="minute"]'); await sleep(5);
click('#start'); await sleep(5);
ok(await advanceUntil(() => dbg().played >= 8), 'Минута: передача идёт');
await hide(true);
ok(dbg().phase === 'stopped' && $('#rg-restart') && !$('#rg-part') && !$('#rg-done'),
  'Минута, обрыв посреди звука: только «Начать заново», без разбора');
await hide(false);
click('#rg-restart'); await sleep(5);

// ——— «Минута» дослушана до конца, свернули — «Готово» на месте, разбор работает ———
ok(await advanceUntil(() => dbg().ended, 0.2), 'Минута: передача дозвучала (onDone)');
ok($('#rg-note').textContent.includes('Передача окончена'), 'заметка «Передача окончена»');
await hide(true);
ok(dbg().phase === 'receive' && $('#rg-done') && $('#rg-note').textContent.includes('Передача окончена'),
  'после конца передачи сворачивание ничего не меняет: «Готово» на месте');
await hide(false);
$('#rg-input').value = window.__rgText;
enter(); await sleep(5);
ok(dbg().phase === 'result' && text().includes('Радиограмма принята'), 'после конца Enter завершает приём, разбор по правилам');
click('#leave'); await sleep(5);

// ——— Звук не проснулся: «Звук не включился», только «Начать заново» ———
fake.last.state = 'suspended'; fake.last.resumeHangs = true;
await openSetup();
click('#start'); await sleep(1700);
ok(dbg().phase === 'stopped', 'звук не проснулся — передача остановлена');
ok($('#rg-note').textContent.includes('Звук не включился') && !text().includes('Передача окончена'),
  '«Звук не включился», а не «Передача окончена»');
ok($('#rg-restart') && !$('#rg-done') && !$('#rg-part'), 'только «Начать заново»');
fake.last.resumeHangs = false;
click('#rg-restart'); await sleep(200);
ok(dbg().phase === 'receive', '«Начать заново» — касание будит звук, приём пошёл');
click('#abort'); await sleep(5);

const fin = saved();
// Принятая «Минута» по правилам даёт веху «радиограмма» и, как и раньше, проверяет вехи
// по времени — «10 минут» засчитывается здесь, а не посреди длинной тренировки.
ok(fin.milestones.radiogram === true && fin.milestones.tenMin === true,
  'вехи: принятая «Минута» дала «радиограмму» и догнала «10 минут» — как в v25');
assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));

// ——— Длина тире (ТЗ-длина-тире.md, тесты 17–18) ———
// Отдельное окно с dahRatio: 4. Тоны пишутся в журнал поддельного звука в момент
// планирования, поэтому длительности известны сразу после нажатия.
{
  const { JSDOM: J } = await import('jsdom');
  const d = new J(html, { url: 'https://example.com/', pretendToBeVisual: true });
  const w = d.window;
  const errs = [];
  w.addEventListener('error', (e) => errs.push(e.error || e.message));
  w.localStorage.setItem('boni_m_state', JSON.stringify(migrate({
    profile: { name: 'Николай', callsign: 'UA5B', points: 5 },
    progress: { ru: { learnedCount: 4 } },
    settings: { knowsAll: true, radiogramCpm: 60, radiogramKind: 'letters', dahRatio: 4 },
    milestones: { first4: true }, totalSeconds: 1000,
  })));
  Object.assign(w, { scrollTo: () => {}, confirm: () => true, alert: () => {}, AudioContext: fake.AudioContext,
    requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame });
  setGlobal('window', w); setGlobal('document', w.document);
  setGlobal('location', w.location); setGlobal('localStorage', w.localStorage);
  await import('../app/app.js?dah');
  await sleep(20);
  const $w = (sel) => w.document.querySelector(sel);
  const cw = (sel) => { const el = $w(sel); assert.ok(el, `длина тире: нет элемента ${sel}`); el.click(); };
  const tab = async (t) => { cw(`#tabs [data-tab="${t}"]`); await sleep(5); };
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  // Новые тоны после действия: есть ли тире в 4 точки и нет ли эталонного в 3.
  const heard = async (wpm, act) => {
    const n0 = fake.tones.length;
    await act();
    await sleep(5);
    const dit = 1.2 / wpm;
    const lens = fake.tones.slice(n0).map((t) => t.dur);
    return { long: lens.some((l) => near(l, 4 * dit)), std: lens.some((l) => near(l, 3 * dit)), lens, dit };
  };
  const learnWpm = 18;
  ok($w('#radiogram') && $w('#drill'), 'длина тире: окно с dahRatio = 4 открыто, радиограмма и позывной на главной');

  // 17) Радиограмма: только 1 и 3 точки на её скорости, ни одного тона в 4.
  {
    cw('#radiogram'); await sleep(5);
    if ($w('[data-dur="short"]')) cw('[data-dur="short"]');
    await sleep(5);
    const r = await heard(60 / 5, async () => { cw('#start'); });
    ok(r.lens.length > 10, `радиограмма: тоны запланированы (${r.lens.length})`);
    ok(r.lens.every((l) => near(l, r.dit) || near(l, 3 * r.dit)) && !r.long,
      'радиограмма при «заметно длиннее»: все тоны 1 или 3 точки, ни одного в 4');
    cw('#abort'); await sleep(5);
    if ($w('#leave')) { cw('#leave'); await sleep(5); }
    await tab('home');
  }

  // 18) Каждый учебный путь звучит с тире в 4 точки.
  // «Учиться»: знак случайный из четырёх (Е Т И М) — входим, пока не выпадет знак с тире.
  {
    let r = { long: false, std: true };
    for (let i = 0; i < 40 && !r.long; i++) {
      r = await heard(learnWpm, async () => { cw('#continue'); });
      await tab('home');
    }
    ok(r.long && !r.std, '«Учиться»: тире 4 точки');
  }
  {
    const r = await heard(learnWpm, async () => { cw('#drill'); await sleep(5); cw('#play'); });
    ok(r.long && !r.std, 'позывной (#play): тире 4 точки');
    await tab('home');
  }
  {
    cw('#puzzle'); await sleep(5);
    cw('.pz-cat[data-cat="msg"]'); await sleep(5);
    const r = await heard(learnWpm, async () => { cw('#pz-listen'); });
    ok(r.long && !r.std, 'Радиоигра (#pz-listen): тире 4 точки');
    await tab('home');
  }
  {
    await tab('ref');
    const r = await heard(learnWpm, async () => { cw('.cell[data-c="Т"]'); await sleep(5); cw('#play'); });
    ok(r.long && !r.std, '«Азбука» → карточка «Т» → «Послушать»: тире 4 точки');
    cw('#x'); await sleep(5);
  }
  {
    await tab('key');
    const keyWpm = JSON.parse(w.localStorage.getItem('boni_m_state')).settings.keyWpm;
    // Знак случайный — «Другой знак», пока не выпадет знак с тире (Т или М).
    for (let i = 0; i < 40 && !/[ТМ]/.test($w('.taskchar')?.textContent || ''); i++) { cw('#newtarget'); await sleep(2); }
    const r = await heard(keyWpm, async () => { cw('#sample'); });
    ok(r.long && !r.std, '«Ключ → Тренировка» → «Послушать»: тире 4 точки');
  }
  {
    await tab('home');
    cw('#gear'); await sleep(5);
    const dah = $w('#ldah');
    const r = await heard(learnWpm, async () => { dah.value = '2'; dah.dispatchEvent(new w.Event('change', { bubbles: true })); });
    ok(r.long && !r.std, 'пробный «К» по change у #ldah: тире 4 точки');
  }
  ok(errs.length === 0, 'длина тире: без ошибок — ' + errs.map(String).join(' | '));
}
console.log(`\nДымовой тест радиограммы со звуком пройден: ${pass} проверок, ошибок ${errors.length}`);
process.exit(0);
