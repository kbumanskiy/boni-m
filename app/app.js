// Бони М — контроллер интерфейса. Чистая логика — в js/*, здесь только экраны и события.
import * as DATA from './js/data.js';
import { load, save, needsOnboarding } from './js/state.js';
import { clampEff, charTiming, classifyHold, keyThresholds } from './js/timing.js';
import * as P from './js/progress.js';
import * as G from './js/gamify.js';
import * as A from './js/audio.js';
import * as KT from './js/keytext.js';

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
  // Уход из «Учиться» любым путём (нижнее меню, кнопка) фиксирует сессию — иначе серия
  // дней и журнал не запишутся, когда папа просто тапнет «Главная».
  if (currentTab === 'learn' && tab !== 'learn') finalizeLearnSession();
  if (currentTab === 'key' && tab !== 'key') clearKeyTimers();
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
  if (!ids.length) return Promise.resolve();
  const titles = ids.map((id) => G.MILESTONES[id]?.title).filter(Boolean).join(' · ');
  return showHero('hero-radost.webp', 'Новая веха!', titles, 2200);
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
    <button class="btn secondary" id="again" style="margin-top:14px">🔁 Повторить</button>
    <label class="muted" style="margin-top:8px">🐢 Скорость морзянки 🐇 (${state.settings.effWpm})</label>
    <input type="range" id="lspeed" min="5" max="15" value="${Math.min(15, state.settings.effWpm)}">
    <button class="btn ghost" id="help" style="margin-top:6px">Подсказка: коды набора</button>
    <div id="help-box"></div>`;
  $('#exit').addEventListener('click', exitLearn);
  $('#again').addEventListener('click', () => playTarget());
  // Живой регулятор скорости: меняем при перетаскивании, переигрываем на отпускании (без «спама» звуком).
  const lspeed = $('#lspeed');
  lspeed.addEventListener('input', (e) => {
    state.settings.effWpm = clampEff(+e.target.value, state.settings.charWpm);
    persist();
    const lbl = lspeed.previousElementSibling;
    if (lbl) lbl.textContent = `🐢 Скорость морзянки 🐇 (${state.settings.effWpm})`;
  });
  lspeed.addEventListener('change', () => { if (!L.locked && !L.awaiting) playTarget(); });
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
  const cols3 = L.options.length === 6 || L.options.length === 9;
  // disabled здесь = идёт проигрывание знака → мягко гасим кнопки (класс playing).
  box.className = 'options' + (cols3 ? ' cols3' : '') + (disabled ? ' playing' : '');
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
    // Лёгкое подтверждение прямо на месте (кнопка зеленеет + надпись), без полноэкранного
    // оверлея на каждый ответ — за занятие их 15+, иначе папа ждёт впустую. Полноэкранный
    // герой остаётся для событий: новый знак, веха, позывной.
    G.awardCorrect(state);
    chosen.classList.add('correct');
    A.cue('success'); vibrate(30);
    $('#fb').className = 'feedback center ok';
    $('#fb').textContent = 'Верно!';
    persist();
    L.awaiting = true;
    setTimeout(() => {
      if (currentTab !== 'learn') return;
      L.awaiting = false;
      if (!afterAnswerProgress()) nextRound();
    }, 600);
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
    $('#nextbtn').addEventListener('click', () => { if (!afterAnswerProgress()) nextRound(); });
    persist();
  }
}

// Продвижение, вехи, предложение отложить — после ответа (не в режиме повторения).
// Возвращает true, если функция сама берёт на себя переход к следующему знаку
// (показывает событие-оверлей или диалог «отложить») — тогда вызывающий не делает nextRound.
function afterAnswerProgress() {
  if (L.repetition) return false;
  const t = track(), alpha = state.settings.alphabet;

  // 1) Открылся новый знак — это событие: показываем героя и ТОЛЬКО ПОТОМ следующий раунд.
  if (P.shouldOpenNext(t, alpha)) {
    const opened = P.openNext(t, alpha);
    const info = DATA.charInfo(opened);
    const chant = state.settings.showChants && alpha === 'ru' && info?.chant ? `, напев «${info.chant}»` : '';
    const newly = G.checkMilestones(state);
    persist();
    showHero('hero-radost.webp', `Открыт новый знак: ${opened}`, `${visualCode(codeOf(opened))}${chant}`, 2400)
      .then(() => (newly.length ? milestoneBanner(newly) : null))
      .then(() => { if (currentTab === 'learn') nextRound(); });
    return true;
  }

  // 2) Знак даётся трудно — предложить отложить (свой поток перехода в offerPark).
  if (P.shouldOfferPark(t, alpha)) { offerPark(); return true; }

  // 3) Веха без нового знака — короткий баннер, затем следующий раунд.
  const newly = G.checkMilestones(state);
  persist();
  if (newly.length) {
    milestoneBanner(newly).then(() => { if (currentTab === 'learn') nextRound(); });
    return true;
  }
  return false;
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
  $('#keep').addEventListener('click', () => { overlayRoot.innerHTML = ''; L.awaiting = false; nextRound(); });
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

// Засчитать текущее занятие один раз (≥15 ответов). Вызывается из любого ухода.
function finalizeLearnSession() {
  if (!L || L.recorded || L.answers < 15) return false;
  const acc = Math.round(L.correct / L.answers * 100);
  const counted = G.recordSession(state, { answers: L.answers, accuracyPct: acc, todayStr: G.localDate() });
  L.recorded = true;
  persist();
  return counted;
}

function exitLearn() {
  stopActiveClock();
  const counted = finalizeLearnSession();
  if (counted && L) {
    const acc = Math.round(L.correct / L.answers * 100);
    showHero('hero-radost.webp', 'Занятие засчитано', `Ответов: ${L.answers}, точность ${acc}%`, 1800)
      .then(() => { learnOpts.repetition = false; go('home'); });
    return;
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
function clearKeyTimers() { if (K) { clearTimeout(K.gapTimer); clearTimeout(K.spaceTimer); K.gapTimer = K.spaceTimer = null; } }

function renderKey() {
  clearKeyTimers();
  const mode = state.settings.keyMode === 'free' ? 'free' : 'train';
  K = { mode, elements: [], holdStart: null, gapTimer: null, spaceTimer: null, target: null, line: KT.emptyLine() };
  const toggle = `<div class="seg">
      <button data-m="train" class="${mode === 'train' ? 'active' : ''}">Тренировка</button>
      <button data-m="free" class="${mode === 'free' ? 'active' : ''}">Свободно</button>
    </div>`;
  const speedCtl = `
    <label class="muted" style="margin-top:10px">🐢 Скорость ключа 🐇 (${state.settings.keyWpm})</label>
    <input type="range" id="kspeed" min="8" max="18" value="${state.settings.keyWpm}">`;

  if (mode === 'train') {
    const order = P.activeSet(track(), state.settings.alphabet);
    K.target = order[Math.floor(Math.random() * order.length)];
    screenEl.innerHTML = `
      <h2>Ключ</h2>${toggle}
      <p class="muted center">Отстучите: <b style="font-size:28px;color:var(--accent-dark)">${esc(K.target)}</b>
        <button class="btn ghost switch" id="sample" style="display:inline-flex;width:auto;margin-left:8px">🔊 образец</button></p>
      <div class="keyout" id="keyout">·</div>
      <div class="keychar" id="keychar">&nbsp;</div>
      <div class="keypad" id="pad">Нажимайте и держите</div>
      <button class="btn ghost" id="newtarget">Другой знак</button>${speedCtl}`;
    $('#sample').addEventListener('click', () => A.playCode(codeOf(K.target), { ...state.settings, charWpm: state.settings.keyWpm, effWpm: state.settings.keyWpm }, {}));
    $('#newtarget').addEventListener('click', renderKey);
  } else {
    screenEl.innerHTML = `
      <h2>Ключ</h2>${toggle}
      <p class="muted center">Отстукивайте — буквы складываются в строку. Пауза подольше = пробел.</p>
      <div class="keytext" id="text"></div>
      <div class="keyout" id="keyout">·</div>
      <div class="keypad" id="pad">Нажимайте и держите</div>
      <div class="btn-row">
        <button class="btn secondary" id="erase">⌫ Стереть</button>
        <button class="btn secondary" id="clear">Очистить</button>
      </div>${speedCtl}`;
    renderKeyLine();
    $('#erase').addEventListener('click', () => { clearKeyTimers(); K.elements = []; setKeyout('·'); K.line = KT.eraseLast(K.line); renderKeyLine(); vibrate(10); });
    $('#clear').addEventListener('click', () => { clearKeyTimers(); K.elements = []; setKeyout('·'); K.line = KT.clearLine(); renderKeyLine(); vibrate(10); });
  }

  screenEl.querySelectorAll('.seg [data-m]').forEach((b) =>
    b.addEventListener('click', () => { state.settings.keyMode = b.dataset.m; persist(); renderKey(); }));

  const kspeed = $('#kspeed');
  if (kspeed) kspeed.addEventListener('input', (e) => {
    state.settings.keyWpm = Math.min(18, Math.max(8, Math.round(+e.target.value)));
    persist();
    const lbl = kspeed.previousElementSibling;
    if (lbl) lbl.textContent = `🐢 Скорость ключа 🐇 (${state.settings.keyWpm})`;
  });

  const pad = $('#pad');
  const down = (e) => { e.preventDefault(); keyPadDown(); };
  const up = (e) => { e.preventDefault(); keyPadUp(); };
  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointerleave', up);
  pad.addEventListener('pointercancel', up);
  startActiveClock();
}

const setKeyout = (s) => { const el = $('#keyout'); if (el) el.textContent = s; };
function renderKeyLine() {
  const el = $('#text'); if (!el) return;
  el.innerHTML = K.line.text
    ? `${esc(K.line.text)}<span style="color:var(--accent)">▌</span>`
    : '<span class="muted">отстукивайте слово…</span>';
}

function keyPadDown() {
  if (K.holdStart !== null) return;
  clearKeyTimers(); // новое нажатие отменяет ожидание конца знака/пробела
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
  const th = keyThresholds(state.settings.keyWpm);
  if (hold < th.debounceMin) return; // фильтр дребезга (§13.7)
  const el = classifyHold(hold, state.settings.keyWpm);
  K.elements.push(el);
  setKeyout(K.elements.join(' ').replace(/\./g, '•').replace(/-/g, '—'));
  // ждём паузу конца знака (3·keyDit) → декодируем
  K.gapTimer = setTimeout(() => decodeKey(), th.charGapMin * 1000);
}
function decodeKey() {
  K.gapTimer = null;
  const code = K.elements.join('');
  K.elements = [];
  setKeyout('·');
  const map = DATA.CODE_BY_CHAR[state.settings.alphabet];
  let found = '?';
  for (const [ch, c] of map.entries()) if (c === code) { found = ch; break; }

  if (K.mode === 'train') {
    const ok = found === K.target;
    const el = $('#keychar');
    if (el) el.innerHTML = found === '?' ? '<span class="muted">не распознано</span>'
      : `<span style="color:${ok ? 'var(--success)' : 'var(--text)'}">${esc(found)}</span>${ok ? ' ✓' : ''}`;
    if (ok) { A.cue('success'); vibrate(40); }
    return;
  }

  // Свободный режим.
  if (found === '?') { setKeyout('?'); setTimeout(() => setKeyout('·'), 600); return; }
  K.line = KT.addChar(K.line, found);
  renderKeyLine();
  A.cue('success'); vibrate(20);
  // Авто-пробел: если пауза продлится — поставить ОДИН пробел (щедрый порог против случайной задумчивости).
  const th = keyThresholds(state.settings.keyWpm);
  const autoSpaceMs = Math.max(900, (th.wordGapMin - th.charGapMin) * 1000);
  K.spaceTimer = setTimeout(() => {
    K.spaceTimer = null;
    const next = KT.addSpace(K.line);
    if (next !== K.line) { K.line = next; renderKeyLine(); } // больше пробел не ждём — один максимум
  }, autoSpaceMs);
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
      <div style="font-weight:700;margin-top:4px">${esc(rank)}</div>
      <label style="text-align:left">Имя</label><input type="text" id="name" value="${esc(state.profile.name)}">
      <label style="text-align:left">Позывной</label><input type="text" id="callsign" value="${esc(state.profile.callsign)}">
    </div>
    <div class="card">
      <b>🌐 Язык азбуки</b>
      <div class="seg" style="margin-bottom:0">
        <button id="lang-ru" class="${s.alphabet === 'ru' ? 'active' : ''}">Русская</button>
        <button id="lang-en" class="${s.alphabet === 'en' ? 'active' : ''}">English</button>
      </div>
    </div>
    <div class="card">
      <b>Мои успехи</b>
      <div class="rowflex"><span>Освоено знаков</span><span>${t.learnedCount} / 32</span></div>
      <div class="rowflex"><span>Цифры</span><span>${t.digitsLearned} / 10</span></div>
      <div class="rowflex"><span>Дни в эфире</span><span>${state.streak.current} (лучшая ${state.streak.longest})</span></div>
      <div class="rowflex"><span>Всего в эфире</span><span>${Math.round(state.totalSeconds / 60)} мин</span></div>
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
    </div>
    <div class="card">
      <b>Резервная копия</b>
      <button class="btn secondary" id="backup">💾 Сохранить копию</button>
      <button class="btn secondary" id="restore">📂 Восстановить из копии</button>
      <input type="file" id="file" accept="application/json" class="hidden">
    </div>
    <button class="btn ghost" id="reset" style="color:var(--error);margin-top:22px">Сбросить прогресс</button>`;
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
  $('#lang-ru').addEventListener('click', () => { s.alphabet = 'ru'; persist(); renderCabinet(); });
  $('#lang-en').addEventListener('click', () => { s.alphabet = 'en'; persist(); renderCabinet(); });
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
  if (document.hidden) { A.stopAll(); stopActiveClock(); if (currentTab === 'key') { clearKeyTimers(); if (K) { K.holdStart = null; K.elements = []; } } }
  else if (currentTab === 'learn' || currentTab === 'key') {
    startActiveClock();
    // Сворачивание во время проигрывания обрывает звук и оставляет кнопки заблокированными —
    // переиграем текущий знак, чтобы занятие не «зависло».
    if (currentTab === 'learn' && L && L.locked && !L.awaiting) playTarget();
  }
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
