// Звук на Web Audio (ТЗ §4, §13). Без аудиофайлов — генерация тона.
// Проигрывание планируется на часах AudioContext (не setTimeout) — это снимает дрожание
// и даёт точную синхронизацию визуальной вспышки (§11).
import { codeToSchedule, charTiming } from './timing.js';

const ATTACK = 0.005; // 5 мс плавный фронт, чтобы не было щелчков
const RELEASE = 0.005;

let ctx = null;
let activeStops = []; // функции остановки текущих звуков
let rafId = null;

// §13.1: AudioContext создаётся/возобновляется ТОЛЬКО по жесту пользователя.
export function ensureAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

// Остановить все текущие звуки (например, при уходе со вкладки — §13.8).
export function stopAll() {
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
  if (!c) { if (onDone) onDone(); return () => {}; }
  stopAll();
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
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const now = c.currentTime;
    while (idx < flashEvents.length && flashEvents[idx].time <= now) {
      if (onFlash) onFlash(flashEvents[idx].kind);
      idx++;
    }
    if (now >= endTime) {
      if (onFlash) onFlash(null);
      if (onDone) onDone();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => { cancelled = true; stopAll(); };
}

// Проиграть последовательность знаков как радиограмму (для спецдрилла позывного §9).
export function playSequence(chars, codeOf, settings, { onDone } = {}) {
  const c = ensureAudio();
  if (!c) { if (onDone) onDone(); return () => {}; }
  stopAll();
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
    if (c.currentTime >= endTime) { if (onDone) onDone(); return; }
    rafId = requestAnimationFrame(check);
  };
  rafId = requestAnimationFrame(check);
  return () => stopAll();
}

// ——— Режим «Ключ»: тон звучит, пока палец прижат (§7.3) ———
let keyOsc = null, keyGain = null;
export function keyDown(toneHz, volume) {
  const c = ensureAudio();
  if (!c) return;
  if (keyOsc) return; // уже звучит
  keyOsc = c.createOscillator();
  keyGain = c.createGain();
  keyOsc.type = 'sine';
  keyOsc.frequency.value = toneHz;
  const now = c.currentTime;
  keyGain.gain.setValueAtTime(0, now);
  keyGain.gain.linearRampToValueAtTime(volume, now + ATTACK);
  keyOsc.connect(keyGain).connect(c.destination);
  keyOsc.start(now);
}
export function keyUp() {
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
