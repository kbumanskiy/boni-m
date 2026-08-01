// Тесты звукового модуля — та часть, которую можно проверить без настоящего динамика.
// Главное здесь — поведение айфона: Web Audio сам по себе попадает в «тихую» категорию,
// и боковой переключатель «Без звука» глушит морзянку полностью. Плюс проверка, что
// ничего не планируется на замороженных часах спящего контекста.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let seq = 0;
// Каждому тесту — своя копия модуля: в нём есть состояние (контекст, флаг разблокировки).
const freshAudio = () => import(`../app/js/audio.js?case=${++seq}`);

// Поддельная звуковая система браузера: запоминает, что было создано и запущено.
function fakeEnv({ audioSession = true, startState = 'running', ios = true,
                   wakeDelay = 60, neverWakes = false, legacyResume = false } = {}) {
  const log = { started: [], media: [], sessionTypes: [] };
  const ctxRef = { value: null };

  class FakeParam {
    constructor() { this.value = 0; }
    setValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; }
    cancelScheduledValues() { return this; }
  }
  class FakeNode {
    connect(next) { return next; }
  }
  class FakeCtx {
    constructor() {
      this.state = startState;
      this.currentTime = startState === 'running' ? 10 : 0;
      this.destination = new FakeNode();
      this.resumeCalls = 0;
      ctxRef.value = this;
    }
    resume() {
      this.resumeCalls++;
      // Настоящий resume асинхронный, и часы стоят, пока он не выполнится. Задержка
      // здесь намеренная: без неё «спящий» случай проверялся бы формально.
      // neverWakes — айфон во время входящего звонка: обещание не выполняется никогда.
      if (neverWakes) return new Promise(() => {});
      setTimeout(() => { this.state = 'running'; this.currentTime = 10; }, wakeDelay);
      // legacyResume — старый webkitAudioContext: обещания не возвращает вовсе.
      if (legacyResume) return undefined;
      return new Promise((r) => setTimeout(r, wakeDelay));
    }
    createOscillator() {
      const ctx = this;
      const osc = Object.assign(new FakeNode(), {
        type: '', frequency: new FakeParam(),
        start(t) { log.started.push({ at: t, ctxState: ctx.state, ctxTime: ctx.currentTime }); },
        stop() {}, onended: null,
      });
      return osc;
    }
    createGain() { return Object.assign(new FakeNode(), { gain: new FakeParam() }); }
  }

  const win = { AudioContext: FakeCtx };
  const nav = ios
    ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605.1', platform: 'iPhone', maxTouchPoints: 5 }
    : { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/124', platform: 'Linux armv8l', maxTouchPoints: 5 };
  if (audioSession) {
    nav.audioSession = { _type: 'auto', set type(v) { log.sessionTypes.push(v); this._type = v; }, get type() { return this._type; } };
  }
  class FakeAudio {
    constructor(src) {
      this.src = src; this.loop = false; this.playCalls = 0; this.paused = true;
      log.media.push(this);
    }
    setAttribute() {}
    play() { this.playCalls++; this.paused = false; return Promise.resolve(); }
  }

  const saved = {
    window: globalThis.window, navigator: globalThis.navigator, Audio: globalThis.Audio,
    raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame,
  };
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  globalThis.Audio = FakeAudio;
  // Кадры должны реально прокручиваться, иначе цикл ожидания конца знака не двигается
  // и до onDone не доходит ни один тест — ровно так все проверки ниже когда-то «прошли»
  // на коде, где onDone срабатывал дважды.
  const frames = new Map();
  let frameId = 0;
  globalThis.requestAnimationFrame = (cb) => { frames.set(++frameId, cb); return frameId; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  // Прокрутить кадры, подвигав часы контекста вперёд.
  log.runFrames = (steps = 40, dt = 0.05) => {
    for (let i = 0; i < steps; i++) {
      if (ctxRef.value) ctxRef.value.currentTime += dt;
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, cb] of pending) cb();
    }
  };

  const restore = () => {
    Object.defineProperty(globalThis, 'window', { value: saved.window, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: saved.navigator, configurable: true, writable: true });
    globalThis.Audio = saved.Audio;
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.caf;
  };
  return { log, restore };
}

test('айфон: просим категорию «playback», иначе переключатель «Без звука» глушит морзянку', async () => {
  const env = fakeEnv({ audioSession: true });
  try {
    const A = await freshAudio();
    A.ensureAudio();
    assert.deepEqual(env.log.sessionTypes, ['playback'],
      'без явной категории звук на айфоне пропадает в беззвучном режиме');
  } finally { env.restore(); }
});

test('старые айфоны без audioSession: разблокировка беззвучным медиа-элементом', async () => {
  const env = fakeEnv({ audioSession: false });
  try {
    const A = await freshAudio();
    A.ensureAudio();
    assert.equal(env.log.media.length, 1, 'должен появиться беззвучный элемент-разблокировщик');
    assert.ok(env.log.media[0].src.startsWith('data:audio/wav'), 'файлов нет — только data-URI');
    assert.equal(env.log.media[0].playCalls, 1, 'элемент должен реально проиграться');
    assert.equal(env.log.media[0].loop, true, 'категория держится, пока элемент играет');
  } finally { env.restore(); }
});

test('Android: беззвучный элемент не создаётся — там этой болячки нет', async () => {
  const env = fakeEnv({ audioSession: false, ios: false });
  try {
    const A = await freshAudio();
    A.ensureAudio();
    assert.equal(env.log.media.length, 0,
      'лишний играющий элемент может приглушить чужую музыку на телефоне папы');
  } finally { env.restore(); }
});

test('прерванный звонком контекст (состояние iOS «interrupted») будим тоже', async () => {
  const env = fakeEnv({ startState: 'interrupted' });
  try {
    const A = await freshAudio();
    const c = A.ensureAudio();
    assert.equal(c.resumeCalls, 1, 'после звонка звук не должен молчать до перезапуска');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(c.state, 'running');
  } finally { env.restore(); }
});

test('разблокировка не плодит элементы на каждый знак', async () => {
  const env = fakeEnv({ audioSession: false });
  try {
    const A = await freshAudio();
    A.ensureAudio(); A.ensureAudio(); A.ensureAudio();
    assert.equal(env.log.media.length, 1);
  } finally { env.restore(); }
});

test('старые iOS: после звонка беззвучный элемент запускается снова', async () => {
  const env = fakeEnv({ audioSession: false });
  try {
    const A = await freshAudio();
    A.ensureAudio();
    const el = env.log.media[0];
    assert.equal(el.playCalls, 1);
    el.paused = true;            // iOS ставит фоновое медиа на паузу при звонке
    A.ensureAudio();
    assert.equal(el.playCalls, 2,
      'иначе категория падает обратно и переключатель снова глушит морзянку');
    assert.equal(env.log.media.length, 1, 'элемент тот же, а не новый');
  } finally { env.restore(); }
});

test('спящий контекст: ничего не планируем, пока часы стоят', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    A.playCode('.-', { toneHz: 600, volume: 0.5, charWpm: 18, effWpm: 9 }, {});
    assert.equal(env.log.started.length, 0, 'на замороженных часах звук уходит в никуда');
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(env.log.started.length > 0, 'после пробуждения знак всё-таки звучит');
    assert.ok(env.log.started.every((s) => s.ctxState === 'running'),
      'все тоны запланированы уже на идущих часах');
  } finally { env.restore(); }
});

test('идущий контекст: знак планируется сразу, без задержки', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    const A = await freshAudio();
    A.playCode('.-', { toneHz: 600, volume: 0.5, charWpm: 18, effWpm: 9 }, {});
    assert.equal(env.log.started.length, 2, 'точка и тире планируются синхронно с нажатием');
  } finally { env.restore(); }
});

// ——— Находки ревью 1 августа 2026. Каждый тест падал на коде, который был выложен. ———

const SET = { toneHz: 600, volume: 0.5, charWpm: 18, effWpm: 9 };

test('два нажатия, пока звук просыпается, не накладывают знак сам на себя', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    const done = [];
    A.playCode('.-', SET, { onDone: (p) => done.push(`первый:${p}`) });
    A.playCode('.-', SET, { onDone: (p) => done.push(`второй:${p}`) });
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(env.log.started.length, 2,
      'знак должен прозвучать один раз, а не вдвое громче поверх самого себя');
    env.log.runFrames();
    assert.deepEqual(done, ['второй:true'],
      'отменённое проигрывание не должно отчитываться о завершении');
  } finally { env.restore(); }
});

test('уход с экрана гасит и то, что ещё только ждёт пробуждения', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    let done = 0;
    A.playCode('.-', SET, { onDone: () => { done++; } });
    A.stopAll(); // так делает переход по нижнему меню — экран сейчас будет заменён
    await new Promise((r) => setTimeout(r, 250));
    env.log.runFrames();
    assert.equal(env.log.started.length, 0, 'звук после ухода с экрана не нужен');
    assert.equal(done, 0, 'onDone на месте уничтоженного экрана роняет приложение');
  } finally { env.restore(); }
});

test('onDone(true) приходит ровно один раз, когда знак прозвучал', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    const A = await freshAudio();
    const done = [];
    A.playCode('.-', SET, { onDone: (p) => done.push(p) });
    env.log.runFrames();
    env.log.runFrames();
    assert.deepEqual(done, [true]);
  } finally { env.restore(); }
});

test('звук не проснулся — onDone(false), а не вечное ожидание', async () => {
  const env = fakeEnv({ startState: 'suspended', neverWakes: true });
  try {
    const A = await freshAudio();
    const done = [];
    A.playCode('.-', SET, { onDone: (p) => done.push(p) });
    await new Promise((r) => setTimeout(r, 1800));
    assert.deepEqual(done, [false],
      'иначе занятие замирает с горящей лампой и серыми кнопками до перезапуска');
    assert.equal(env.log.started.length, 0);
  } finally { env.restore(); }
});

test('старый WebKit: resume() ничего не возвращает — знак всё равно звучит', async () => {
  const env = fakeEnv({ startState: 'suspended', legacyResume: true });
  try {
    const A = await freshAudio();
    const done = [];
    A.playCode('.-', SET, { onDone: (p) => done.push(p) });
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(env.log.started.length > 0,
      'состояние надо спрашивать самим, а не верить обещанию, которого нет');
    env.log.runFrames();
    assert.deepEqual(done, [true]);
  } finally { env.restore(); }
});

test('подтверждение ответа тоже ждёт пробуждения, а не пропадает', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    A.cue('success');
    assert.equal(env.log.started.length, 0);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(env.log.started.length, 2, 'два тона подтверждения должны прозвучать');
    assert.ok(env.log.started.every((s) => s.ctxState === 'running'));
  } finally { env.restore(); }
});

test('«Ключ»: отпустил палец до пробуждения — тон не начинается задним числом', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    A.keyDown(600, 0.5);
    A.keyUp();
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(env.log.started.length, 0, 'иначе тон зазвучит, когда палец уже убран');
  } finally { env.restore(); }
});

test('«Ключ»: палец держат — тон начинается после пробуждения', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    A.keyDown(600, 0.5);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(env.log.started.length, 1, 'площадка вжата — звук обязан быть');
    assert.equal(env.log.started[0].ctxState, 'running');
  } finally { env.restore(); }
});
