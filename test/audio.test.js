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
  const log = { started: [], media: [], sessionTypes: [], stoppedNow: 0, stops: [] };
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
        // stop() без времени — немедленная остановка (stopAll), со временем — плановая.
        stop(t) { if (t === undefined) log.stoppedNow++; else log.stops.push(t); }, onended: null,
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

// ——— Последовательность знаков (радиограмма, позывной, Радиоигра) ———
// Радиоигра открывает варианты ответа только после того, как сигнал прозвучал до конца,
// и не открывает, если звук не проснулся. Для этого onDone обязан различать два случая.
test('последовательность: onDone(true) один раз, лампа и знаки в такт, в конце всё гаснет', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    const A = await freshAudio();
    const done = [], flashes = [], chars = [];
    const codes = { 'А': '.-', 'Б': '-...' };
    A.playSequence([...'А Б'], (ch) => codes[ch], { ...SET, charWpm: 40, effWpm: 40 }, {
      onDone: (p) => done.push(p), onFlash: (on) => flashes.push(on), onChar: (i) => chars.push(i),
    });
    env.log.runFrames(80);
    env.log.runFrames(10);
    assert.deepEqual(done, [true]);
    assert.deepEqual(chars, [0, 1, null], 'пробел не считается знаком, в конце — null');
    assert.equal(flashes.filter((x) => x === true).length, 6, 'лампа загорается на каждую точку и тире');
    assert.equal(flashes.at(-1), false, 'в конце лампа погашена');
  } finally { env.restore(); }
});

test('последовательность: звук не проснулся — onDone(false) и лампа погашена', async () => {
  const env = fakeEnv({ startState: 'suspended', neverWakes: true });
  try {
    const A = await freshAudio();
    const done = [], flashes = [];
    A.playSequence(['А'], () => '.-', SET, { onDone: (p) => done.push(p), onFlash: (on) => flashes.push(on) });
    await new Promise((r) => setTimeout(r, 1800));
    assert.deepEqual(done, [false], 'иначе варианты открылись бы вслепую');
    assert.deepEqual(flashes, [false]);
    assert.equal(env.log.started.length, 0);
  } finally { env.restore(); }
});

test('последовательность: без Web Audio — onDone(true), как у одиночного знака', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    globalThis.window.AudioContext = undefined;
    const A = await freshAudio();
    const done = [];
    A.playSequence(['А'], () => '.-', SET, { onDone: (p) => done.push(p) });
    assert.deepEqual(done, [true]);
  } finally { env.restore(); }
});

// ——— Состояние звука (раздел 10 ТЗ длинных радиограмм) ———
// По нему app.js решает, прозвучал ли знак на самом деле. Статус обязан быть верным
// уже ВНУТРИ onDone: обработчик читает его там же, а не после.
test('audioStatus: «idle» до первого звука', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    const A = await freshAudio();
    assert.equal(A.audioStatus(), 'idle');
  } finally { env.restore(); }
});

test('audioStatus: «unsupported» без Web Audio — и уже внутри onDone', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    globalThis.window.AudioContext = undefined;
    const A = await freshAudio();
    const seen = [];
    A.playCode('.-', SET, { onDone: (p) => seen.push([p, A.audioStatus()]) });
    assert.deepEqual(seen, [[true, 'unsupported']], 'контракт onDone прежний: true, но статус честный');
    A.playSequence(['А'], () => '.-', SET, { onDone: (p) => seen.push([p, A.audioStatus()]) });
    assert.deepEqual(seen.at(-1), [true, 'unsupported']);
  } finally { env.restore(); }
});

test('audioStatus: «failed», если конструктор звука бросил исключение', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    globalThis.window.AudioContext = class { constructor() { throw new Error('NotAllowed'); } };
    const A = await freshAudio();
    const seen = [];
    A.playCode('.-', SET, { onDone: (p) => seen.push([p, A.audioStatus()]) });
    assert.deepEqual(seen, [[true, 'failed']]);
  } finally { env.restore(); }
});

test('audioStatus: «asleep», если контекст не проснулся за 1,5 с', async () => {
  const env = fakeEnv({ startState: 'suspended', neverWakes: true });
  try {
    const A = await freshAudio();
    const seen = [];
    A.playCode('.-', SET, { onDone: (p) => seen.push([p, A.audioStatus()]) });
    await new Promise((r) => setTimeout(r, 1800));
    assert.deepEqual(seen, [[false, 'asleep']]);
    A.playSequence(['А'], () => '.-', SET, { onDone: (p) => seen.push([p, A.audioStatus()]) });
    await new Promise((r) => setTimeout(r, 1800));
    assert.deepEqual(seen.at(-1), [false, 'asleep']);
  } finally { env.restore(); }
});

test('audioStatus: «running» после доигранного знака и доигранной последовательности', async () => {
  const env = fakeEnv({ startState: 'running' });
  try {
    const A = await freshAudio();
    const seen = [];
    A.playCode('.-', SET, { onDone: (p) => seen.push([p, A.audioStatus()]) });
    assert.equal(A.audioStatus(), 'idle', 'пока знак не доиграл — «работает» ещё не доказано');
    env.log.runFrames();
    assert.deepEqual(seen, [[true, 'running']]);
    A.playSequence([...'А Б'], (ch) => ({ 'А': '.-', 'Б': '-...' })[ch], { ...SET, charWpm: 40, effWpm: 40 },
      { onDone: (p) => seen.push([p, A.audioStatus()]) });
    env.log.runFrames(80);
    assert.deepEqual(seen.at(-1), [true, 'running']);
  } finally { env.restore(); }
});

// ——— План передачи и настоящая очередь звука (длинная радиограмма, раздел 2.7) ———
// Полоса и «Осталось около…» считаются по sequenceTimeline из timing.js, а звук ставит
// playSequence. Тест держит их совпадение: разойдутся — полоса врёт.
test('план передачи совпадает с тем, что реально запланировал playSequence (250 знаков)', async () => {
  const env = fakeEnv({ startState: 'running', ios: false });
  try {
    const A = await freshAudio();
    const { makeRadiogram } = await import('../app/js/radiogram.js');
    const { sequenceTimeline } = await import('../app/js/timing.js');
    const { CODE_BY_CHAR, KOCH_ORDER_RU, DIGIT_ORDER } = await import('../app/js/data.js');
    const codeOf = (ch) => CODE_BY_CHAR.ru.get(ch) || '';
    let rnd = 7; const next = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
    const text = [...makeRadiogram([...KOCH_ORDER_RU, ...DIGIT_ORDER], 50, next)];
    const wpm = 225 / 5;
    const done = [];
    A.playSequence(text, codeOf, { ...SET, charWpm: wpm, effWpm: wpm }, { onDone: (p) => done.push(p) });
    const chars = text.filter((c) => c !== ' ');
    const tones = chars.reduce((n, c) => n + codeOf(c).length, 0);
    assert.equal(chars.length, 250);
    assert.equal(env.log.started.length, tones, 'по осциллятору на каждую точку и тире');
    const tl = sequenceTimeline(text, codeOf, wpm, wpm);
    assert.equal(tl.starts.length, 250);
    let k = 0;
    const t0 = env.log.started[0].at;
    chars.forEach((c, i) => {
      const at = env.log.started[k].at - t0;
      assert.ok(Math.abs(at - tl.starts[i]) < 1e-6, `знак ${i}: звук ${at}, план ${tl.starts[i]}`);
      k += codeOf(c).length;
    });
    env.log.runFrames(4000, 0.05);
    env.log.runFrames(10, 0.05);
    assert.deepEqual(done, [true], 'onDone(true) ровно один раз');
  } finally { env.restore(); }
});

test('stopAll посреди длинной передачи: onDone не приходит, звук остановлен', async () => {
  const env = fakeEnv({ startState: 'running', ios: false });
  try {
    const A = await freshAudio();
    const done = [];
    const text = [...'ЖЖЖЖЖ '.repeat(50).trim()];
    A.playSequence(text, () => '...-', { ...SET, charWpm: 8, effWpm: 8 }, { onDone: (p) => done.push(p) });
    env.log.runFrames(20, 0.05);
    A.stopAll();
    env.log.runFrames(4000, 0.5);
    assert.deepEqual(done, [], 'оборванная передача не отчитывается о конце');
    assert.equal(env.log.stoppedNow, env.log.started.length, 'каждый запланированный тон остановлен');
  } finally { env.restore(); }
});

// ——— Длина тире (ТЗ-длина-тире.md, тесты 6, 7, 7а) ———
// Длина тона = плановая остановка минус старт минус хвост 0,01 с из scheduleTone.
const toneLens = (log) => log.started.map((st, i) => log.stops[i] - st.at - 0.01);
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('длина тире: playCode с dahUnits = 4 — тире 4 точки; без ключа — 3', async () => {
  const dit = 1.2 / 18;
  for (const [extra, units] of [[{ dahUnits: 4 }, 4], [{}, 3]]) {
    const env = fakeEnv({ startState: 'running', ios: false });
    try {
      const A = await freshAudio();
      A.playCode('-', { ...SET, charWpm: 18, ...extra }, {});
      const [len] = toneLens(env.log);
      assert.ok(near(len, units * dit), `ожидали ${units} точки, тон ${len}`);
    } finally { env.restore(); }
  }
});

test('длина тире: playSequence с dahUnits = 4 — тоны по 4 точки, пауза между знаками прежняя', async () => {
  const dit = 1.2 / 18;
  const codeOf = (ch) => (ch === 'Т' ? '-' : '');
  const run = async (extra) => {
    const env = fakeEnv({ startState: 'running', ios: false });
    try {
      const A = await freshAudio();
      A.playSequence(['Т', 'Т'], codeOf, { ...SET, ...extra }, {});
      const lens = toneLens(env.log);
      const gap = env.log.started[1].at - env.log.started[0].at - lens[0];
      return { lens, gap };
    } finally { env.restore(); }
  };
  const long = await run({ dahUnits: 4 });
  const std = await run({});
  assert.ok(long.lens.every((l) => near(l, 4 * dit)), `тоны ${long.lens}`);
  assert.ok(std.lens.every((l) => near(l, 3 * dit)), `стандарт ${std.lens}`);
  assert.ok(near(long.gap, std.gap), `пауза между знаками ${long.gap} против ${std.gap}`);
});

test('длина тире: хранимое поле dahRatio звук не читает — без dahUnits тире всегда 3 (радиограмма, старый app.js)', async () => {
  const dit = 1.2 / 18;
  for (const play of ['code', 'seq']) {
    const env = fakeEnv({ startState: 'running', ios: false });
    try {
      const A = await freshAudio();
      const s = { ...SET, dahRatio: 4 };
      if (play === 'code') A.playCode('-', s, {});
      else A.playSequence(['Т'], () => '-', s, {});
      const [len] = toneLens(env.log);
      assert.ok(near(len, 3 * dit), `${play}: тон ${len}, а должен быть 3 точки`);
    } finally { env.restore(); }
  }
});
