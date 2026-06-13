// Бони М — контроллер интерфейса. Чистая логика — в js/*, здесь только экраны и события.
import * as DATA from './js/data.js';
import { load, save, needsOnboarding } from './js/state.js';
import { clampEff, charTiming } from './js/timing.js';
import * as P from './js/progress.js';
import * as G from './js/gamify.js';
import * as A from './js/audio.js';

let state = load();
const persist = () => save(state);

const $ = (sel, root = document) => root.querySelector(sel);
const screenEl = $('#screen');
const tabsEl = $('#tabs');
const overlayRoot = $('#overlay-root');

const codeOf = (ch) => DATA.CODE_BY_CHAR[state.settings.alphabet]?.get(ch) || DATA.charInfo(ch)?.code || '';
const visualCode = (code) => code.split('').map((c) => (c === '.' ? '•' : '—')).join(' ');
const track = () => state.progress[state.settings.alphabet];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function vibrate(ms) {
  try { if (state.settings.vibration && 'vibrate' in navigator) navigator.vibrate(ms); } catch {}
}

// ——— Активное время практики (§7.2): копим, пока вкладка видима и идёт занятие ———
let activeStart = null;
function startActiveClock() { if (activeStart === null) activeStart = Date.now(); }
function stopActiveClock() {
  if (activeStart !== null) {
    G.addActiveTime(state, (Date.now() - activeStart) / 1000);
    activeStart = null;
    persist();
  }
}

let currentTab = 'home';
function go(tab) {
  if (tab !== 'learn' && tab !== 'key') stopActiveClock();
  currentTab = tab;
  A.stopAll();
  [...tabsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  tabsEl.classList.remove('hidden');
  if (tab === 'home') renderHome();
  else if (tab === 'learn') renderLearn();
  else if (tab === 'key') renderKey();
  else if (tab === 'ref') renderReference();
  else if (tab === 'cabinet') renderCabinet();
  window.scrollTo(0, 0);
}
tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tab === 'learn') learnOpts.repetition = false; // обычный вход — не «Повторение»
  go(b.dataset.tab);
});

// ——— Оверлей реакции героя ———
function showHero(img, title, sub, ms = 1200) {
  return new Promise((resolve) => {
    overlayRoot.innerHTML = `<div class="overlay"><img src="assets/${img}" alt=""><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
    setTimeout(() => { overlayRoot.innerHTML = ''; resolve(); }, ms);
  });
}
function milestoneBanner(ids) {
  if (!ids.length) return;
  const titles = ids.map((id) => G.MILESTONES[id]?.title).filter(Boolean).join(' · ');
  showHero('hero-radost.webp', 'Новая веха!', titles, 2200);
}

// ——————————————————————————— Онбординг (§7.1) ———————————————————————————
function renderOnboarding() {
  tabsEl.classList.add('hidden');
  screenEl.innerHTML = `
    <div class="center">
      <img class="hero" src="assets/hero-zastavka.webp" alt="Бони М за ключом">
      <h1>Здравствуйте!</h1>
      <p class="muted">Как вас зовут?</p>
      <input type="text" id="name" placeholder="Ваше имя" autocomplete="off">
      <label>Позывной</label>
      <input type="text" id="callsign" value="${esc(state.profile.callsign)}">
      <button class="btn" id="next" disabled>Дальше</button>
    </div>`;
  const name = $('#name'), next = $('#next');
  name.addEventListener('input', () => { next.disabled = !name.value.trim(); });
  next.addEventListener('click', () => {
    state.profile.name = name.value.trim();
    state.profile.callsign = $('#callsign').value.trim() || 'Boney M';
    persist();
    onboardingStep2();
  });
  name.focus();
}
function onboardingStep2() {
  screenEl.innerHTML = `
    <div class="center">
      <img class="hero" src="assets/hero-portret.webp" alt="">
      <h1>Рады знакомству, ${esc(state.profile.name)}!</h1>
      <div class="card" style="text-align:left">
        <p>Здесь вы научитесь принимать и передавать морзянку на слух.</p>
        <p>Начнём с четырёх знаков и будем добавлять новые, когда вы будете готовы.</p>
      </div>
      <button class="btn" id="start">Начать</button>
    </div>`;
  $('#start').addEventListener('click', () => { P.ensureStarted(track()); persist(); go('home'); });
}

// ——————————————————————————— Главная (§7.1) ———————————————————————————
function renderHome() {
  const t = track();
  P.ensureStarted(t);
  const learned = t.learnedCount;
  const total = DATA.KOCH_ORDER_RU.length;
  const rank = G.rankFor(learned, G.avgAccuracy(t));
  const greeted = state._greeted ? 'С возвращением' : 'Здравствуйте';
  state._greeted = true;
  const drill = G.callsignDrillAvailable(t) && !state.milestones.callsign;
  screenEl.innerHTML = `
    <div class="topbar">
      <img class="avatar" id="toCab" src="assets/hero-portret.webp" alt="Кабинет">
      <div class="grow"><strong>${esc(greeted)}, ${esc(state.profile.name)}!</strong></div>
      <span class="chip" id="toCab2">${esc(state.profile.callsign)}</span>
    </div>
    <img class="hero" src="assets/hero-zastavka.webp" alt="">
    <div class="card">
      <div class="rowflex"><strong>${esc(rank)}</strong><span class="muted">Освоено: ${learned} из ${total}</span></div>
      <div class="progress"><i style="width:${Math.round(learned / total * 100)}%"></i></div>
      <div class="rowflex muted"><span>📡 Дни в эфире: ${state.streak.current}</span><span>Лучшая: ${state.streak.longest}</span></div>
    </div>
    ${drill ? `<button class="btn secondary" id="drill">📨 Принять свой позывной</button>` : ''}
    <button class="btn" id="continue">Продолжить обучение</button>
    <button class="btn secondary" id="review" ${learned < 1 ? 'disabled' : ''}>Повторение пройденного</button>`;
  $('#toCab').addEventListener('click', () => go('cabinet'));
  $('#toCab2').addEventListener('click', () => go('cabinet'));
  $('#continue').addEventListener('click', () => { learnOpts.repetition = false; go('learn'); });
  $('#review').addEventListener('click', () => { learnOpts.repetition = true; go('learn'); });
  if (drill) $('#drill').addEventListener('click', callsignDrill);
}

// ——————————————————————————— Учиться (§7.2) ———————————————————————————
const learnOpts = { repetition: false };
let L = null; // состояние занятия

function renderLearn() {
  const t = track();
  P.ensureStarted(t);
  const repetition = learnOpts.repetition;
  L = { target: null, options: [], recentTargets: [], locked: false, answers: 0, correct: 0,
        repetition, slow: false, awaiting: false };
  screenEl.innerHTML = `
    <div class="rowflex">
      <h2>${repetition ? 'Повторение' : 'Учиться'}</h2>
      <button class="btn ghost switch" id="exit">Выход</button>
    </div>
    <div class="flash" id="flash" aria-hidden="true">•</div>
    <div class="feedback center" id="fb">Слушайте знак…</div>
    <div class="options" id="opts"></div>
    <div class="btn-row" style="margin-top:14px">
      <button class="btn secondary" id="again">🔁 Повторить</button>
      <button class="btn secondary" id="slow">🐢 Медленнее</button>
    </div>
    <button class="btn ghost" id="help">Подсказка: коды набора</button>
    <div id="help-box"></div>`;
  $('#exit').addEventListener('click', exitLearn);
  $('#again').addEventListener('click', () => playTarget());
  $('#slow').addEventListener('click', () => { L.slow = true; playTarget(); });
  $('#help').addEventListener('click', toggleHelp);
  startActiveClock();
  nextRound();
}

function settingsForPlay() {
  const s = { ...state.settings };
  if (L.slow) s.effWpm = clampEff(Math.max(5, s.effWpm - 3), s.charWpm);
  return s;
}

function nextRound() {
  L.slow = false; L.awaiting = false;
  const active = P.activeSet(track(), state.settings.alphabet);
  const newest = L.repetition ? null : P.newestChar(track(), state.settings.alphabet);
  L.target = P.pickTarget(active, L.recentTargets, newest);
  L.recentTargets.push(L.target);
  L.options = P.buildOptions(active, L.target, newest);
  renderOptions(true);
  $('#fb').textContent = 'Слушайте знак…';
  $('#fb').className = 'feedback center';
  playTarget();
}

function playTarget() {
  L.locked = true;
  renderOptions(true);
  const flash = $('#flash');
  A.playCode(codeOf(L.target), settingsForPlay(), {
    onFlash: (kind) => {
      flash.classList.remove('on-dit', 'on-dah');
      if (kind === 'dit') flash.classList.add('on-dit');
      else if (kind === 'dah') flash.classList.add('on-dah');
    },
    onDone: () => { L.locked = false; renderOptions(false); },
  });
}

function renderOptions(disabled) {
  const box = $('#opts');
  box.className = 'options' + (L.options.length === 6 || L.options.length === 9 ? ' cols3' : '');
  box.innerHTML = L.options.map((c) => `<button class="opt" data-c="${esc(c)}" ${disabled ? 'disabled' : ''}>${esc(c)}</button>`).join('');
  [...box.children].forEach((b) => b.addEventListener('click', () => answer(b.dataset.c)));
}

function answer(ch) {
  if (L.locked || L.awaiting) return;
  const correct = ch === L.target;
  const t = track();
  P.recordAnswer(t, L.target, correct, !L.repetition);
  L.answers++; if (correct) L.correct++;
  const box = $('#opts');
  [...box.children].forEach((b) => { b.disabled = true; });
  const chosen = [...box.children].find((b) => b.dataset.c === ch);
  const right = [...box.children].find((b) => b.dataset.c === L.target);

  if (correct) {
    G.awardCorrect(state);
    chosen.classList.add('correct');
    A.cue('success'); vibrate(30);
    persist();
    afterAnswerProgress();
    showHero('hero-radost.webp', 'Верно!', '', 1100).then(() => { if (currentTab === 'learn') nextRound(); });
  } else {
    L.awaiting = true;
    if (chosen) chosen.classList.add('wrong');
    right.classList.add('reveal');
    A.cue('error'); vibrate([20, 40, 20]);
    const info = DATA.charInfo(L.target);
    const chant = state.settings.showChants && state.settings.alphabet === 'ru' && info?.chant ? `<div class="chant">напев: ${esc(info.chant)}</div>` : '';
    $('#fb').className = 'feedback center no';
    $('#fb').innerHTML = `Это «${esc(L.target)}» <span class="codeline">${visualCode(codeOf(L.target))}</span>${chant}
      <button class="btn secondary" id="relisten" style="max-width:220px;margin:10px auto">Переслушать</button>
      <button class="btn" id="nextbtn" style="max-width:220px;margin:6px auto">Дальше</button>`;
    $('#relisten').addEventListener('click', () => A.playCode(codeOf(L.target), settingsForPlay(), {}));
    $('#nextbtn').addEventListener('click', () => { afterAnswerProgress(); nextRound(); });
    persist();
  }
}

// Продвижение, вехи, предложение отложить — после ответа (не в режиме повторения).
function afterAnswerProgress() {
  if (L.repetition) return;
  const t = track(), alpha = state.settings.alphabet;
  if (P.shouldOpenNext(t, alpha)) {
    const opened = P.openNext(t, alpha);
    const info = DATA.charInfo(opened);
    const chant = state.settings.showChants && state.settings.alphabet === 'ru' && info?.chant ? `, напев «${info.chant}»` : '';
    persist();
    setTimeout(() => showHero('hero-radost.webp', `Открыт новый знак: ${opened}`, `${visualCode(codeOf(opened))}${chant}`, 2400), 1150);
  } else if (P.shouldOfferPark(t, alpha)) {
    offerPark();
  }
  const newly = G.checkMilestones(state);
  persist();
  if (newly.length) setTimeout(() => milestoneBanner(newly), 1200);
}

function offerPark() {
  L.awaiting = true;
  overlayRoot.innerHTML = `<div class="overlay"><img src="assets/hero-portret.webp" alt="">
    <h2 style="color:var(--text)">Этот знак пока даётся трудно</h2>
    <p>Отложить его на потом и продолжить со следующего?</p>
    <button class="btn" id="park" style="max-width:260px">Отложить на потом</button>
    <button class="btn secondary" id="keep" style="max-width:260px">Оставить, поучу ещё</button></div>`;
  $('#park').addEventListener('click', () => {
    P.parkNewest(track(), state.settings.alphabet); persist();
    overlayRoot.innerHTML = ''; L.awaiting = false; nextRound();
  });
  $('#keep').addEventListener('click', () => { overlayRoot.innerHTML = ''; L.awaiting = false; });
}

function toggleHelp() {
  const box = $('#help-box');
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const active = P.activeSet(track(), state.settings.alphabet);
  box.innerHTML = `<div class="card"><ul class="list">${active.map((c) => {
    const info = DATA.charInfo(c);
    const chant = state.settings.showChants && state.settings.alphabet === 'ru' && info?.chant ? ` <span class="chant">${esc(info.chant)}</span>` : '';
    return `<li><b>${esc(c)}</b><span class="codeline" style="font-size:22px">${visualCode(codeOf(c))}</span>${chant}</li>`;
  }).join('')}</ul></div>`;
}

function exitLearn() {
  stopActiveClock();
  if (L && L.answers >= 15) {
    const acc = Math.round(L.correct / L.answers * 100);
    const counted = G.recordSession(state, { answers: L.answers, accuracyPct: acc, todayStr: G.localDate() });
    persist();
    if (counted) {
      showHero('hero-radost.webp', 'Занятие засчитано', `Ответов: ${L.answers}, точность ${acc}%`, 1800).then(() => { learnOpts.repetition = false; go('home'); });
      return;
    }
  }
  learnOpts.repetition = false;
  go('home');
}

// ——— Спецдрилл «Свой позывной» (§9) ———
function callsignDrill() {
  tabsEl.classList.add('hidden');
  screenEl.innerHTML = `<div class="center">
    <h2>Ваш позывной на слух</h2>
    <img class="hero small" src="assets/hero-klyuch.webp" alt="">
    <p class="muted">Сейчас прозвучит ваш позывной целиком, как радиограмма. Это коды, которые вы уже знаете.</p>
    <div class="codeline">Boney&nbsp;M</div>
    <button class="btn" id="play">Прослушать</button>
    <button class="btn secondary" id="got">Я принял!</button>
    <button class="btn ghost" id="back">Назад</button></div>`;
  $('#play').addEventListener('click', () => A.playSequence(DATA.CALLSIGN_RU_CHARS, (c) => DATA.CODE_BY_CHAR.ru.get(c), state.settings, {}));
  $('#got').addEventListener('click', () => {
    const newly = G.checkMilestones(state, { callsignReceived: true });
    persist();
    showHero('hero-radost.webp', 'Позывной принят!', 'Boney M', 2200).then(() => { milestoneBanner(newly); go('home'); });
  });
  $('#back').addEventListener('click', () => go('home'));
}

// ——————————————————————————— Ключ (§7.3) ———————————————————————————
let K = null;
function renderKey() {
  K = { elements: [], lastUp: null, holdStart: null, gapTimer: null, target: null };
  const order = P.activeSet(track(), state.settings.alphabet);
  K.target = order[Math.floor(Math.random() * order.length)];
  screenEl.innerHTML = `
    <h2>Ключ</h2>
    <p class="muted center">Отстучите: <b style="font-size:28px;color:var(--accent-dark)">${esc(K.target)}</b>
      <button class="btn ghost switch" id="sample" style="display:inline-flex;width:auto;margin-left:8px">🔊 образец</button></p>
    <div class="keyout" id="keyout">·</div>
    <div class="keychar" id="keychar">&nbsp;</div>
    <div class="keypad" id="pad">Нажимайте и держите</div>
    <button class="btn ghost" id="newtarget">Другой знак</button>`;
  $('#sample').addEventListener('click', () => A.playCode(codeOf(K.target), { ...state.settings, charWpm: state.settings.keyWpm, effWpm: state.settings.keyWpm }, {}));
  $('#newtarget').addEventListener('click', renderKey);
  const pad = $('#pad');
  const down = (e) => { e.preventDefault(); keyPadDown(); };
  const up = (e) => { e.preventDefault(); keyPadUp(); };
  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointerleave', up);
  pad.addEventListener('pointercancel', up);
  startActiveClock();
}

function keyPadDown() {
  if (K.holdStart !== null) return;
  if (K.gapTimer) { clearTimeout(K.gapTimer); K.gapTimer = null; }
  K.holdStart = Date.now();
  $('#pad').classList.add('down');
  A.keyDown(state.settings.toneHz, state.settings.volume);
  vibrate(15);
}
function keyPadUp() {
  if (K.holdStart === null) return;
  const hold = (Date.now() - K.holdStart) / 1000;
  K.holdStart = null;
  $('#pad').classList.remove('down');
  A.keyUp();
  const { keyDit, debounceMin } = require_thresholds();
  if (hold < debounceMin) return; // фильтр дребезга
  const el = hold <= 2 * keyDit + 1e-9 ? '.' : '-';
  K.elements.push(el);
  $('#keyout').textContent = K.elements.join(' ').replace(/\./g, '•').replace(/-/g, '—');
  // ждём паузу: конец знака (3·dit) или слова (7·dit)
  K.gapTimer = setTimeout(() => decodeKey(false), 3 * keyDit * 1000);
}
function require_thresholds() {
  const keyDit = 1.2 / state.settings.keyWpm;
  return { keyDit, debounceMin: 0.3 * keyDit };
}
function decodeKey() {
  const code = K.elements.join('');
  const map = DATA.CODE_BY_CHAR[state.settings.alphabet];
  let found = '?';
  for (const [ch, c] of map.entries()) if (c === code) { found = ch; break; }
  const ok = found === K.target;
  $('#keychar').innerHTML = found === '?' ? '<span class="muted">не распознано</span>'
    : `<span style="color:${ok ? 'var(--success)' : 'var(--text)'}">${esc(found)}</span>${ok ? ' ✓' : ''}`;
  if (ok) { A.cue('success'); vibrate(40); }
  K.elements = [];
  $('#keyout').textContent = '·';
}

// ——————————————————————————— Справочник (§7.4) ———————————————————————————
let refAlpha = 'ru', refSection = 'letters';
function renderReference() {
  const letters = refAlpha === 'ru' ? DATA.RU_LETTERS : DATA.EN_LETTERS;
  let items = letters;
  if (refSection === 'digits') items = DATA.DIGITS;
  else if (refSection === 'punct') items = DATA.PUNCTUATION;
  screenEl.innerHTML = `
    <h2>Справочник</h2>
    <div class="seg">
      <button data-a="ru" class="${refAlpha === 'ru' ? 'active' : ''}">РУС</button>
      <button data-a="en" class="${refAlpha === 'en' ? 'active' : ''}">ENG</button>
    </div>
    <div class="seg">
      <button data-s="letters" class="${refSection === 'letters' ? 'active' : ''}">Буквы</button>
      <button data-s="digits" class="${refSection === 'digits' ? 'active' : ''}">Цифры</button>
      <button data-s="punct" class="${refSection === 'punct' ? 'active' : ''}">Доп.</button>
    </div>
    <div class="grid" id="grid">${items.map((it) => `
      <button class="cell" data-c="${esc(it.char)}"><span>${esc(it.char)}</span><small>${visualCode(it.code)}</small></button>`).join('')}</div>
    <div id="card-box"></div>`;
  screenEl.querySelectorAll('.seg [data-a]').forEach((b) => b.addEventListener('click', () => { refAlpha = b.dataset.a; renderReference(); }));
  screenEl.querySelectorAll('.seg [data-s]').forEach((b) => b.addEventListener('click', () => { refSection = b.dataset.s; renderReference(); }));
  screenEl.querySelectorAll('.cell').forEach((b) => b.addEventListener('click', () => refCard(b.dataset.c)));
}
function refCard(ch) {
  const info = DATA.charInfo(ch);
  const code = info.code;
  const chant = refAlpha === 'ru' && state.settings.showChants && info.chant ? `<div class="chant">напев: ${esc(info.chant)}</div>` : '';
  overlayRoot.innerHTML = `<div class="overlay">
    <button class="btn ghost" id="x" style="position:absolute;top:16px;right:16px;width:auto">✕</button>
    <div style="font-size:72px;font-weight:800;color:var(--text)">${esc(ch)}</div>
    <div class="codeline" style="font-size:44px">${visualCode(code)}</div>
    ${chant}
    <button class="btn" id="play" style="max-width:220px">🔊 Послушать</button></div>`;
  const playSettings = () => DATA.DIGITS.some((d) => d.char === ch)
    ? { ...state.settings } : { ...state.settings, alphabet: refAlpha };
  $('#play').addEventListener('click', () => A.playCode(code, playSettings(), {}));
  $('#x').addEventListener('click', () => { overlayRoot.innerHTML = ''; });
  overlayRoot.firstElementChild.addEventListener('click', (e) => { if (e.target === overlayRoot.firstElementChild) overlayRoot.innerHTML = ''; });
}

// ——————————————————————————— Кабинет «Бортжурнал» (§7.5) ———————————————————————————
function renderCabinet() {
  const t = track();
  const rank = G.rankFor(t.learnedCount, G.avgAccuracy(t));
  const s = state.settings;
  const ms = Object.values(G.MILESTONES).map((m) => `<li><span>${state.milestones[m.id] ? '✅' : '⬜'} ${esc(m.title)}</span></li>`).join('');
  const hist = state.history.slice(-10).reverse().map((h) => `<li><span>${esc(h.date)}</span><span class="muted">${h.answers} отв · ${h.accuracyPct}%</span></li>`).join('') || '<li class="muted">пока пусто</li>';
  screenEl.innerHTML = `
    <div class="rowflex"><h2>Бортжурнал</h2><button class="btn ghost switch" id="back">Назад</button></div>
    <div class="card center">
      <img class="avatar" src="assets/hero-portret.webp" alt="" style="width:80px;height:80px">
      <div class="odometer">${state.profile.points}</div><div class="muted">очков опыта</div>
    </div>
    <div class="card">
      <label>Имя</label><input type="text" id="name" value="${esc(state.profile.name)}">
      <label>Позывной</label><input type="text" id="callsign" value="${esc(state.profile.callsign)}">
    </div>
    <div class="card">
      <div class="rowflex"><b>${esc(rank)}</b><span>Освоено: ${t.learnedCount}/32</span></div>
      <div class="rowflex muted"><span>Цифры: ${t.digitsLearned}/10</span><span>Серия: ${state.streak.current} (лучшая ${state.streak.longest})</span></div>
      <div class="muted">В эфире: ${Math.round(state.totalSeconds / 60)} мин</div>
    </div>
    <div class="card"><b>Журнал занятий</b><ul class="list">${hist}</ul></div>
    <div class="card"><b>Вехи</b><ul class="list">${ms}</ul></div>
    <div class="card">
      <b>Настройки</b>
      <label>Скорость: медленнее ↔ быстрее (${s.effWpm})</label>
      <input type="range" id="eff" min="5" max="15" value="${Math.min(15, s.effWpm)}">
      <label>Тон: ниже ↔ выше (${s.toneHz} Гц)</label>
      <input type="range" id="tone" min="500" max="800" step="10" value="${s.toneHz}">
      <label>Громкость</label>
      <input type="range" id="vol" min="0" max="1" step="0.05" value="${s.volume}">
      <label>Скорость ключа (${s.keyWpm})</label>
      <input type="range" id="key" min="8" max="18" value="${s.keyWpm}">
      <div class="rowflex"><span>Напевы (рус)</span><button class="btn secondary switch" id="chants">${s.showChants ? 'Вкл' : 'Выкл'}</button></div>
      <div class="rowflex"><span>Вибрация</span><button class="btn secondary switch" id="vib">${s.vibration ? 'Вкл' : 'Выкл'}</button></div>
      <div class="rowflex"><span>Алфавит</span><button class="btn secondary switch" id="alpha">${s.alphabet === 'ru' ? 'РУС' : 'ENG'}</button></div>
    </div>
    <div class="card">
      <b>Резервная копия</b>
      <button class="btn secondary" id="backup">💾 Сохранить копию</button>
      <button class="btn secondary" id="restore">📂 Восстановить из копии</button>
      <input type="file" id="file" accept="application/json" class="hidden">
    </div>
    <button class="btn ghost" id="reset" style="color:var(--error)">Сбросить прогресс</button>`;
  $('#back').addEventListener('click', () => go('home'));
  const saveProfile = () => { state.profile.name = $('#name').value.trim() || state.profile.name; state.profile.callsign = $('#callsign').value.trim() || 'Boney M'; persist(); };
  $('#name').addEventListener('change', saveProfile);
  $('#callsign').addEventListener('change', saveProfile);
  $('#eff').addEventListener('input', (e) => { s.effWpm = clampEff(+e.target.value, s.charWpm); persist(); });
  $('#tone').addEventListener('input', (e) => { s.toneHz = +e.target.value; persist(); });
  $('#vol').addEventListener('input', (e) => { s.volume = +e.target.value; persist(); });
  $('#key').addEventListener('input', (e) => { s.keyWpm = +e.target.value; persist(); });
  $('#tone').addEventListener('change', () => A.playCode('-.-', state.settings, {}));
  $('#chants').addEventListener('click', () => { s.showChants = !s.showChants; persist(); renderCabinet(); });
  $('#vib').addEventListener('click', () => { s.vibration = !s.vibration; persist(); renderCabinet(); });
  $('#alpha').addEventListener('click', () => { s.alphabet = s.alphabet === 'ru' ? 'en' : 'ru'; persist(); renderCabinet(); });
  $('#backup').addEventListener('click', doBackup);
  $('#restore').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', doRestore);
  $('#reset').addEventListener('click', () => {
    if (confirm('Точно начать заново? Весь прогресс будет удалён.')) {
      try { localStorage.removeItem('boni_m_state'); } catch {}
      location.reload();
    }
  });
}

function doBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `boni-m-backup-${G.localDate()}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function doRestore(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!confirm('Восстановить прогресс из копии? Текущий прогресс будет заменён.')) return;
      localStorage.setItem('boni_m_state', JSON.stringify(data));
      location.reload();
    } catch { alert('Не удалось прочитать файл копии.'); }
  };
  reader.readAsText(file);
}

// ——————————————————————————— Системное ———————————————————————————
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { A.stopAll(); stopActiveClock(); }
  else if (currentTab === 'learn' || currentTab === 'key') startActiveClock();
});

// Wake Lock во время занятия (§13.5) — мягко, без падений.
let wakeLock = null;
async function requestWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {} }

// Регистрация service worker (офлайн).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// Сохранность данных (§13.12).
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}

// Старт.
if (needsOnboarding(state)) renderOnboarding();
else go('home');
