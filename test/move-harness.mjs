// Каркас дымовых тестов переезда (ТЗ-переезд.md, 7.2). Один файл-сценарий = один процесс:
// app.js читает голые глобальные имена и держит состояние в модуле.
//
//   const T = await boot({ url, store: { boni_m_state: '...' }, move: { MOVE_HOME: true }, nav: {...} });
//   T.ok(cond, 'сообщение');   T.finish();
//
// Что делает каркас:
//  • JSDOM по адресу url; localStorage заполняется из store до запуска приложения;
//  • глобалы window/document/location/history/localStorage/sessionStorage, navigator (подмена полей);
//  • restart подменён счётчиком (window.__restart), confirm/alert/prompt — «упасть»;
//  • fetch записывает запросы, console.* записывает вывод (проверка «код в консоль не попал»);
//  • константы move.js (MOVE_HOME и др.) подменяются загрузчиком модулей Node;
//  • state.js можно подменить файлом прежнего релиза (mixed: true) — смешанный кэш.
// Запись «ok» идёт мимо console, чтобы не мешать проверке консоли.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { makeFakeAudio } from './fake-audio.mjs';

export const NEW = 'https://app.morse73.ru/';
export const OLD = 'https://kbumanskiy.github.io/boni-m/';

export async function boot({ url, store = {}, session = {}, move = {}, nav = {}, mixed = false, name = 'сценарий',
  beforeImport = null, hashAfter = null } = {}) {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.error || e.message));
  for (const [k, v] of Object.entries(store)) window.localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(session)) window.sessionStorage.setItem(k, v);

  const setGlobal = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch {} };
  setGlobal('window', window);
  setGlobal('document', document);
  setGlobal('location', window.location);
  setGlobal('history', window.history);
  setGlobal('localStorage', window.localStorage);
  setGlobal('sessionStorage', window.sessionStorage);
  setGlobal('Blob', window.Blob);
  setGlobal('Event', window.Event);
  setGlobal('FileReader', window.FileReader);
  setGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130', onLine: true, ...nav,
  });
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  window.requestAnimationFrame = global.requestAnimationFrame;
  window.cancelAnimationFrame = global.cancelAnimationFrame;
  const dialogs = [];
  window.confirm = () => { dialogs.push('confirm'); return true; };
  window.alert = () => { dialogs.push('alert'); };
  window.prompt = () => { dialogs.push('prompt'); return null; };
  window.scrollTo = () => {};
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};
  // Приложение зовёт глобальный URL (Node), а Blob у него — из JSDOM: без заглушки скачивание падает.
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  window.AudioContext = makeFakeAudio().AudioContext;
  let restarts = 0;
  window.__restart = () => { restarts++; };

  const sentOut = [];
  global.fetch = async (u, opts = {}) => {
    sentOut.push({ url: String(u), body: String(opts.body || '') });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const consoleSeen = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    console[m] = (...a) => { consoleSeen.push(a.map(String).join(' ')); };
  }

  // Подмены модулей загрузчиком Node.
  const moveUrl = new URL('../app/js/move.js', import.meta.url).href;
  const oldState = new URL('../fixtures/v27/state.js', import.meta.url).href;
  registerHooks({
    resolve(spec, ctx, next) {
      if (mixed && ctx.parentURL && ctx.parentURL.endsWith('/app/app.js') && spec === './js/state.js') {
        return { url: oldState, shortCircuit: true };
      }
      return next(spec, ctx);
    },
    load(u, ctx, next) {
      const r = next(u, ctx);
      if (u === moveUrl && Object.keys(move).length) {
        let src = String(r.source);
        for (const [k, v] of Object.entries(move)) {
          const re = new RegExp(`export const ${k} = [^;]+;`);
          assert.ok(re.test(src), `в move.js нет константы ${k}`);
          src = src.replace(re, `export const ${k} = ${JSON.stringify(v)};`);
        }
        return { ...r, source: src };
      }
      return r;
    },
  });

  if (beforeImport) await beforeImport({ window, document });
  const hashBefore = window.location.hash;
  const historyBefore = window.history.length;
  await import('../app/app.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(40);

  let pass = 0;
  const T = {
    window, document, sentOut, consoleSeen, dialogs, errors, hashBefore, historyBefore,
    sleep,
    get restarts() { return restarts; },
    $: (sel) => document.querySelector(sel),
    $$: (sel) => [...document.querySelectorAll(sel)],
    text: () => document.querySelector('#screen').textContent.replace(/\s+/g, ' ').trim(),
    store: (k) => window.localStorage.getItem(k),
    setStore: (k, v) => window.localStorage.setItem(k, v),
    saved: () => JSON.parse(window.localStorage.getItem('boni_m_state')),
    click(sel) { const el = document.querySelector(sel); assert.ok(el, `нет элемента ${sel}`); el.click(); },
    fire(el, type) { el.dispatchEvent(new window.Event(type, { bubbles: true })); },
    async waitFor(cond, ms = 3000) {
      for (let t = 0; t < ms; t += 5) { if (cond()) return true; await sleep(5); }
      return !!cond();
    },
    ok(cond, msg) { assert.ok(cond, msg); pass++; process.stdout.write(`  ✓ ${msg}\n`); },
    eq(a, b, msg) { assert.deepEqual(a, b, msg); pass++; process.stdout.write(`  ✓ ${msg}\n`); },
    finish() {
      assert.equal(errors.length, 0, 'необработанные ошибки: ' + errors.map(String).join(' | '));
      process.stdout.write(`\n${name}: ${pass} проверок, ошибок 0\n`);
      process.exit(0);
    },
  };
  void hashAfter;
  return T;
}

// Код переноса для сценариев. move.js здесь грузится под другим адресом модуля (?harness), чтобы
// подмены констант загрузчиком (MOVE_HOME) достались только приложению.
export async function codeFor(state, { date = '20261018', ...opts } = {}) {
  const MVp = await import('../app/js/move.js?harness');
  const S = await import('../app/js/state.js');
  return MVp.encodeTransfer(S.exportText(state), { date, ...opts });
}
export async function mkState(name, answers, extra = {}) {
  const S = await import('../app/js/state.js');
  return S.migrate({ profile: { name }, progress: { ru: { learnedCount: 4,
    perChar: { 'Е': { correct: answers, total: answers } } } }, ...extra });
}
export async function snapshot() {
  const S = await import('../app/js/state.js');
  const { v25State } = await import('./fixtures-state.mjs');
  return S.migrate(v25State('2026-10-17'));
}
export async function decodeLink(href) {
  const MVp = await import('../app/js/move.js?harness');
  const S = await import('../app/js/state.js');
  const d = await MVp.decodeTransfer(href);
  return { code: MVp.extractCode(href), date: d.date, state: d.ok ? S.readIncoming(d.json).state : null };
}
