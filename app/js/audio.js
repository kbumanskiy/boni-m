// Звук на Web Audio (ТЗ §4, §13). Без аудиофайлов — генерация тона.
// Проигрывание планируется на часах AudioContext (не setTimeout) — это снимает дрожание
// и даёт точную синхронизацию визуальной вспышки (§11).
import { codeToSchedule, charTiming } from './timing.js';

const ATTACK = 0.005; // 5 мс плавный фронт, чтобы не было щелчков
const RELEASE = 0.005;

let ctx = null;
let activeStops = []; // функции остановки текущих звуков
let rafId = null;

// Номер текущего проигрывания. Пока звук ждёт пробуждения контекста, отменить его
// нечем: остановить ещё нечего, звуков не создано. Поэтому каждое новое проигрывание
// (и любой stopAll) поднимает номер, а всё отложенное с чужим номером само выходит.
// Без этого два нажатия подряд накладывали один знак сам на себя вдвое громче,
// а брошенный цикл ожидания достукивался до экрана, которого уже нет.
let generation = 0;

// Беззвучный WAV прямо в коде: файлов в проекте нет, офлайн не ломается.
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAAAAAAA';
let unlocked = false;
let silentEl = null;

// iPadOS притворяется настольным маком, поэтому дополнительно смотрим на касания.
function isIOS() {
  try {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch { return false; }
}

// На айфоне звук, рождённый только внутри Web Audio, считается фоновым (категория ambient):
// боковой переключатель «Без звука» глушит его целиком — громкость на максимуме, картинка
// живая, а морзянки нет. Категория становится «playback» (переключатель игнорируется),
// если страница заявит об этом явно — либо, на старых iOS, хоть раз проиграет медиа-элемент.
function unlockSilentSwitch() {
  // Категория держится, только пока беззвучный элемент играет, а iOS ставит его на паузу
  // при сворачивании и при входящем звонке. Поэтому проверяем каждый раз, а не однократно:
  // иначе после первого же звонка переключатель «Без звука» снова глушил бы морзянку.
  if (silentEl && silentEl.paused) {
    try { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); } catch {}
  }
  if (unlocked) return;
  unlocked = true;
  try {
    if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; }
  } catch {}
  // Запасной путь — только для старых айфонов. На Android беззвучный медиа-элемент не нужен
  // и вреден: он держит «звук играет» и может приглушить чужую музыку на ровном месте.
  if (!isIOS()) return;
  try {
    silentEl = new Audio(SILENT_WAV);
    silentEl.loop = true; // категория держится, только пока элемент играет
    silentEl.setAttribute('playsinline', '');
    const p = silentEl.play();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

// §13.1: AudioContext создаётся/возобновляется ТОЛЬКО по жесту пользователя.
export function ensureAudio() {
  try {
    unlockSilentSwitch(); // до создания контекста: категория должна быть выбрана заранее
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Не только 'suspended': у Safari есть ещё состояние 'interrupted' (был звонок,
    // сработал будильник). Проверка ровно на 'suspended' оставляла бы звук выключенным
    // до перезапуска приложения.
    if (ctx.state !== 'running') {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  } catch {
    ctx = null;
  }
  return ctx;
}

// resume() асинхронный, а у спящего контекста часы стоят: всё, что запланировано на
// «сейчас + 0.08 с», уходит в никуда, а ожидание конца знака не наступает никогда.
// Поэтому планируем звук только когда часы реально пошли.
//
// Спрашиваем состояние сами, а не ждём обещания от resume(): старый WebKit вообще
// ничего не возвращает, а iOS во время звонка может не ответить никогда. Отдельный
// срок ожидания обязателен — без него занятие замирало с горящей лампой и серыми
// кнопками до перезапуска приложения.
const WAKE_LIMIT_MS = 1500;
const WAKE_STEP_MS = 50;
function whenRunning(c, fn) {
  if (c.state === 'running') { fn(true); return; }
  let waited = 0;
  const poll = () => {
    if (c.state === 'running') { fn(true); return; }
    waited += WAKE_STEP_MS;
    if (waited >= WAKE_LIMIT_MS) { fn(false); return; }
    setTimeout(poll, WAKE_STEP_MS);
  };
  setTimeout(poll, WAKE_STEP_MS);
}

export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

// Остановить все текущие звуки (например, при уходе со вкладки — §13.8).
// Поднятый номер гасит и то, что ещё только ждёт пробуждения контекста.
export function stopAll() {
  generation++;
  for (const stop of activeStops.splice(0)) {
    try { stop(); } catch {}
  }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

// Один тон-сегмент: оборачиваем в GainNode с плавными фронтами.
function scheduleTone(startT, dur, toneHz, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = toneHz;
  gain.gain.setValueAtTime(0, startT);
  gain.gain.linearRampToValueAtTime(volume, startT + ATTACK);
  gain.gain.setValueAtTime(volume, startT + Math.max(ATTACK, dur - RELEASE));
  gain.gain.linearRampToValueAtTime(0, startT + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startT);
  osc.stop(startT + dur + 0.01);
  const stop = () => { try { osc.stop(); } catch {} };
  activeStops.push(stop);
  osc.onended = () => { activeStops = activeStops.filter((s) => s !== stop); };
}

// Проиграть код одного знака. onFlash(kind|null) вызывается синхронно со звуком:
// 'dit'/'dah' — вспышка началась, null — погасла. onDone — после завершения.
export function playCode(code, settings, { onFlash, onDone } = {}) {
  const c = ensureAudio();
  // Web Audio нет вовсе — случай не про сон, а про браузер без звука. Сообщаем «прозвучало»,
  // чтобы занятие не встало намертво: подсказка «нажмите ещё раз» тут ничему не поможет.
  if (!c) { if (onDone) onDone(true); return () => {}; }
  stopAll();
  const mine = ++generation;

  whenRunning(c, (awake) => {
    if (mine !== generation) return; // нас уже сменили другим знаком или уходом с экрана
    // Разбудить контекст не удалось (айфон позволяет это только по касанию). Молчим,
    // но управление возвращаем сразу: иначе занятие зависнет с серыми кнопками.
    if (!awake) { if (onFlash) onFlash(null); if (onDone) onDone(false); return; }

    const { toneHz = 600, volume = 0.5, charWpm = 18, effWpm = 9 } = settings;
    const sched = codeToSchedule(code, charWpm, effWpm);
    const lead = 0.08;
    let t = c.currentTime + lead;

    const flashEvents = []; // { time, kind|null }
    for (const seg of sched) {
      if (seg.tone) {
        scheduleTone(t, seg.dur, toneHz, volume);
        flashEvents.push({ time: t, kind: seg.kind });       // зажечь
        flashEvents.push({ time: t + seg.dur, kind: null }); // погасить
      }
      t += seg.dur;
    }
    const endTime = t;

    // Визуальная синхронизация и onDone — через rAF по часам аудио.
    let idx = 0;
    const tick = () => {
      if (mine !== generation) return;
      const now = c.currentTime;
      while (idx < flashEvents.length && flashEvents[idx].time <= now) {
        if (onFlash) onFlash(flashEvents[idx].kind);
        idx++;
      }
      if (now >= endTime) {
        if (onFlash) onFlash(null);
        if (onDone) onDone(true);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  });

  return () => stopAll();
}

// Проиграть последовательность знаков как радиограмму (для спецдрилла позывного §9).
export function playSequence(chars, codeOf, settings, { onDone } = {}) {
  const c = ensureAudio();
  if (!c) { if (onDone) onDone(); return () => {}; }
  stopAll();
  const mine = ++generation;

  whenRunning(c, (awake) => {
    if (mine !== generation) return;
    if (!awake) { if (onDone) onDone(); return; }

    const { toneHz = 600, volume = 0.5, charWpm = 18, effWpm = 9 } = settings;
    const tmg = charTiming(charWpm, effWpm);
    let t = c.currentTime + 0.1;
    for (const ch of chars) {
      if (ch === ' ') { t += tmg.wordGap; continue; }
      const code = codeOf(ch);
      if (!code) continue;
      const sched = codeToSchedule(code, charWpm, effWpm);
      for (const seg of sched) {
        if (seg.tone) scheduleTone(t, seg.dur, toneHz, volume);
        t += seg.dur;
      }
      t += tmg.charGap;
    }
    const endTime = t;
    const check = () => {
      if (mine !== generation) return;
      if (c.currentTime >= endTime) { if (onDone) onDone(); return; }
      rafId = requestAnimationFrame(check);
    };
    rafId = requestAnimationFrame(check);
  });

  return () => stopAll();
}

// ——— Режим «Ключ»: тон звучит, пока палец прижат (§7.3) ———
let keyOsc = null, keyGain = null;
let keyHeld = false;
export function keyDown(toneHz, volume) {
  const c = ensureAudio();
  if (!c) return;
  if (keyOsc) return; // уже звучит
  keyHeld = true;
  // На спящих часах тон стартовал в прошлом и не звучал вовсе: площадка выглядела
  // вжатой, а звука не было. Ждём пробуждения — и начинаем, только если палец ещё держат.
  whenRunning(c, (awake) => {
    if (!awake || !keyHeld || keyOsc) return;
    keyOsc = c.createOscillator();
    keyGain = c.createGain();
    keyOsc.type = 'sine';
    keyOsc.frequency.value = toneHz;
    const now = c.currentTime;
    keyGain.gain.setValueAtTime(0, now);
    keyGain.gain.linearRampToValueAtTime(volume, now + ATTACK);
    keyOsc.connect(keyGain).connect(c.destination);
    keyOsc.start(now);
  });
}
export function keyUp() {
  keyHeld = false;
  if (!keyOsc || !ctx) return;
  const now = ctx.currentTime;
  try {
    keyGain.gain.cancelScheduledValues(now);
    keyGain.gain.setValueAtTime(keyGain.gain.value, now);
    keyGain.gain.linearRampToValueAtTime(0, now + RELEASE);
    keyOsc.stop(now + RELEASE + 0.01);
  } catch {}
  keyOsc = null; keyGain = null;
}

// Мягкие сигналы успеха/ошибки (не резкие — §15).
export function cue(kind) {
  const c = ensureAudio();
  if (!c) return;
  whenRunning(c, (awake) => { if (awake) playCue(c, kind); });
}
function playCue(c, kind) {
  const now = c.currentTime;
  const notes = kind === 'success' ? [660, 880] : [440, 392]; // вверх / мягко вниз
  notes.forEach((f, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const s = now + i * 0.12;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.35, s + 0.01);
    g.gain.linearRampToValueAtTime(0, s + 0.11);
    osc.connect(g).connect(c.destination);
    osc.start(s); osc.stop(s + 0.13);
  });
}
