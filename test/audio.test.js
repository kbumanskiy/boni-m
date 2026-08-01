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
function fakeEnv({ audioSession = true, startState = 'running', ios = true } = {}) {
  const log = { started: [], media: [], sessionTypes: [] };

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
      this._pendingResume = null;
    }
    resume() {
      this.resumeCalls++;
      // Настоящий resume асинхронный; часы стоят, пока он не выполнится.
      this._pendingResume = Promise.resolve().then(() => {
        this.state = 'running';
        this.currentTime = 10;
      });
      return this._pendingResume;
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
    constructor(src) { this.src = src; this.loop = false; this.playCalls = 0; log.media.push(this); }
    setAttribute() {}
    play() { this.playCalls++; return Promise.resolve(); }
  }

  const saved = {
    window: globalThis.window, navigator: globalThis.navigator, Audio: globalThis.Audio,
    raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame,
  };
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  globalThis.Audio = FakeAudio;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};

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
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(c.state, 'running');
  } finally { env.restore(); }
});

test('разблокировка выполняется один раз, а не на каждый знак', async () => {
  const env = fakeEnv({ audioSession: false });
  try {
    const A = await freshAudio();
    A.ensureAudio(); A.ensureAudio(); A.ensureAudio();
    assert.equal(env.log.media.length, 1);
  } finally { env.restore(); }
});

test('спящий контекст: ничего не планируем, пока часы стоят', async () => {
  const env = fakeEnv({ startState: 'suspended' });
  try {
    const A = await freshAudio();
    A.playCode('.-', { toneHz: 600, volume: 0.5, charWpm: 18, effWpm: 9 }, {});
    assert.equal(env.log.started.length, 0, 'на замороженных часах звук уходит в никуда');
    await new Promise((r) => setTimeout(r, 0));
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
