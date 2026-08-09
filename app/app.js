// Школа Морзе 73 — контроллер интерфейса. Чистая логика — в js/*, здесь только экраны и события.
import * as DATA from './js/data.js';
import { load, save, needsOnboarding } from './js/state.js';
import { clampEff, charTiming, classifyHold, keyThresholds } from './js/timing.js';
import * as P from './js/progress.js';
import * as G from './js/gamify.js';
import * as A from './js/audio.js';
import * as KT from './js/keytext.js';
import * as TR from './js/trace.js';
import { ICON } from './js/icons.js';
import { donateUrl, feedbackUrl, validateFeedback, MESSAGE_MAX, CONTACT_MAX, NAME_MAX } from './js/support.js';

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

// ——— «След сигнала»: ритм кода полосками. Подпись оформления и наглядная опора для слуха. ———
const traceHTML = (parts, cls = '') =>
  `<span class="trace ${cls}" aria-hidden="true">${parts.map((p) => `<i class="${p}"></i>`).join('')}</span>`;
const traceOfCode = (code, cls = '') => traceHTML(TR.traceParts(code), cls);
// След по фактическим удержаниям: ширина каждой полоски пропорциональна реальному времени.
const traceOfHolds = (holds, unit, cls = '') =>
  `<span class="trace ${cls}" aria-hidden="true">${TR.traceFromHolds(holds, unit).map((p) =>
    `<i class="${p.tone ? 'tone' : 'g1'}" style="width:calc(var(--u) * ${p.units.toFixed(2)})"></i>`).join('')}</span>`;

// ——— Тема оформления: по настройке телефона либо вручную ———
function applyTheme() {
  const mode = state.settings.theme;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  // Цвет системной панели браузера должен совпадать с фоном, иначе сверху остаётся чужая полоса.
  const dark = mode === 'dark'
    || (mode !== 'light' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#100E0B' : '#F6F1E6');
}

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
  // Сначала остановить часы (время войдёт в totalSeconds), потом засчитывать занятие —
  // иначе веха «10 минут в эфире» опоздает на одно занятие.
  if (tab !== 'learn' && tab !== 'key') stopActiveClock();
  if (currentTab === 'learn' && tab !== 'learn') {
    if (L && L.nextTimer) { clearTimeout(L.nextTimer); L.nextTimer = null; }
    if (L && L.revealTimer) { clearTimeout(L.revealTimer); L.revealTimer = null; }
    finalizeLearnSession();
  }
  if (currentTab === 'key' && tab !== 'key') { clearKeyTimers(); if (K && K.detach) K.detach(); }
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
let heroTimer = null;
function showHero(img, title, sub, ms = 1200) {
  return new Promise((resolve) => {
    if (heroTimer) clearTimeout(heroTimer); // иначе таймер прошлого оверлея погасит этот
    overlayRoot.innerHTML = `<div class="overlay"><img src="assets/${img}" alt=""><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
    heroTimer = setTimeout(() => { heroTimer = null; overlayRoot.innerHTML = ''; resolve(); }, ms);
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
    <div class="center intro">
      <div class="heroblock"><img class="hero" src="assets/hero-zastavka.webp" alt="Радист Боня за ключом"></div>
      <div class="eyebrow">Школа Морзе 73</div>
      <h1>Здравствуйте!</h1>
      <p class="muted">Меня зовут Боня, я радист. Научу принимать морзянку на слух.</p>
      <div class="card" style="text-align:left">
        <label for="name">Как вас зовут?</label>
        <input type="text" id="name" placeholder="Ваше имя" autocomplete="off">
        <label for="callsign">Ваш позывной</label>
        <input type="text" id="callsign" value="${esc(state.profile.callsign)}">
      </div>
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
    <div class="center intro">
      <div class="heroblock"><img class="hero" src="assets/hero-portret.webp" alt=""></div>
      <h1>Рады знакомству, ${esc(state.profile.name)}!</h1>
      <div class="card" style="text-align:left">
        <p>Начнём с четырёх знаков. Новые буквы буду открывать сам — когда увижу,
           что прежние вы уже узнаёте уверенно.</p>
        <p class="muted">Торопиться некуда. Интернет не нужен: всё работает и без него.</p>
      </div>
      <button class="btn" id="start">Начать занятие</button>
    </div>`;
  $('#start').addEventListener('click', () => {
    P.ensureStarted(track());
    // Первые 4 знака открыты прямо сейчас — веха принадлежит этому моменту, а не первому
    // ответу в викторине (иначе «Новая веха!» выпадала даже на неверный ответ новичка).
    G.checkMilestones(state, { triggers: ['chars'] });
    persist();
    go('home');
  });
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
  const ticks = Array.from({ length: total },
    (_, i) => `<i class="${i < learned ? 'on' : ''}"></i>`).join('');
  // Шапки «Станция Boney M» здесь нет намеренно: на главной уже есть портрет Бони и
  // приветствие по имени, а нажимаемый портрет-аватар дублировал вкладку «Журнал».
  screenEl.innerHTML = `
    <div class="heroblock">
      <img class="hero" src="assets/hero-zastavka.webp" alt="">
    </div>
    <div class="greeting">${esc(greeted)}, ${esc(state.profile.name)}!</div>
    <div class="card">
      <div class="eyebrow">Звание</div>
      <div class="rankline">${esc(rank)}</div>
      <div class="ticks" role="img" aria-label="Освоено ${learned} из ${total} знаков">${ticks}</div>
      <div class="learned">Освоено: ${learned} из ${total}</div>
      <div class="stats">
        <div class="stat"><div class="eyebrow">Дней подряд</div><b>${state.streak.current}</b></div>
        <div class="stat"><div class="eyebrow">Рекорд</div><b>${state.streak.longest}</b></div>
      </div>
    </div>
    ${drill ? `<button class="btn secondary" id="drill">${ICON.inbox(24)} Принять свой позывной</button>` : ''}
    <button class="btn" id="continue">Продолжить обучение</button>
    <button class="btn secondary" id="review" ${learned < 1 ? 'disabled' : ''}>Повторение пройденного</button>
    ${supportLine()}`;
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
        repetition, slow: false, awaiting: false, nextTimer: null, revealTimer: null };
  // Всё занятие должно помещаться в один экран: во время урока прокручивать нечего и незачем,
  // а «Повторить» и регулятор скорости нужны под рукой, а не за краем экрана.
  screenEl.innerHTML = `
    <div class="screenbar">
      <div>
        <h2>${repetition ? 'Повторение' : 'Учиться'}</h2>
        <div class="counter" id="counter"></div>
      </div>
      <button class="iconbtn" id="exit" aria-label="Выйти из занятия">${ICON.exit(22)}<span>Выход</span></button>
    </div>
    <div class="lamp" id="flash" aria-hidden="true"></div>
    <div class="feedback center" id="fb">Слушайте знак…</div>
    <div class="options" id="opts"></div>
    <div id="reveal"></div>
    <button class="btn secondary" id="again">${ICON.replay(24)} Послушать ещё раз</button>
    <div class="slider">
      <div class="slider-head">
        <label for="lspeed">Скорость морзянки</label>
        <output class="num" id="lspeed-val">${state.settings.effWpm}</output>
      </div>
      <input type="range" id="lspeed" min="5" max="15" value="${Math.min(15, state.settings.effWpm)}">
      <div class="slider-ends"><span>медленнее</span><span>быстрее</span></div>
    </div>
    <button class="linkbtn" id="help">${ICON.help(22)} Показать коды знаков</button>
    <div id="help-box"></div>`;
  $('#exit').addEventListener('click', exitLearn);
  $('#again').addEventListener('click', () => playTarget());
  renderCounter();
  // Живой регулятор скорости: меняем при перетаскивании, переигрываем на отпускании (без «спама» звуком).
  const lspeed = $('#lspeed');
  lspeed.addEventListener('input', (e) => {
    state.settings.effWpm = clampEff(+e.target.value, state.settings.charWpm);
    persist();
    $('#lspeed-val').textContent = state.settings.effWpm;
  });
  lspeed.addEventListener('change', () => { if (!L.locked && !L.awaiting) playTarget(); });
  $('#help').addEventListener('click', toggleHelp);
  startActiveClock();
  nextRound();
}

// Занятие засчитывается от 15 ответов (§7.2). Без счётчика это правило невидимо.
function renderCounter() {
  const el = $('#counter');
  if (!el) return;
  if (L.repetition) { el.textContent = 'не идёт в зачёт дня'; el.className = 'counter'; return; }
  if (L.answers >= 15) {
    el.innerHTML = `${ICON.check(20)} засчитано · ответов ${L.answers}`;
    el.className = 'counter done';
  } else {
    // Коротко: длинное пояснение занимало три строки и выдавливало занятие за экран.
    el.textContent = `ответов ${L.answers} из 15`;
    el.className = 'counter';
  }
}

function settingsForPlay() {
  const s = { ...state.settings };
  if (L.slow) s.effWpm = clampEff(Math.max(5, s.effWpm - 3), s.charWpm);
  return s;
}

function nextRound() {
  if (L.nextTimer) { clearTimeout(L.nextTimer); L.nextTimer = null; }
  if (L.revealTimer) { clearTimeout(L.revealTimer); L.revealTimer = null; }
  L.slow = false; L.awaiting = false;
  screenEl.classList.remove('revealing');
  const rev = $('#reveal'); if (rev) rev.innerHTML = '';
  const t = track();
  const active = P.activeSet(t, state.settings.alphabet);
  const newest = L.repetition ? null : P.newestChar(t, state.settings.alphabet);
  if (L.recentTargets.length === 0) {
    // Самый первый знак занятия — равномерно и не тот, с которого начали в прошлый раз.
    L.target = P.pickFirstTarget(active, t.lastFirst);
    t.lastFirst = L.target;
    persist();
  } else {
    L.target = P.pickTarget(active, L.recentTargets, newest);
  }
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
  // Подпись сбрасываем здесь, а не только в nextRound: иначе «Нажмите ещё раз» висело бы
  // поверх уже звучащего знака — человек слышит морзянку и читает, что звука нет.
  if (!L.awaiting) {
    $('#fb').textContent = 'Слушайте знак…';
    $('#fb').className = 'feedback center';
  }
  const flash = $('#flash');
  // Лампа горит ровно, пока идёт знак, и НЕ мигает по элементам. Раньше она повторяла
  // ритм: тире светилось втрое дольше точки — код можно было прочитать глазами, ничего
  // не слушая. Это ровно тот навык, который упражнение должно тренировать.
  // Ровное свечение оставляет пользу для слабослышащего («сейчас идёт знак») и убирает подсказку.
  flash.classList.add('on');
  A.playCode(codeOf(L.target), settingsForPlay(), {
    onDone: (played) => {
      flash.classList.remove('on');
      // Знак не прозвучал: айфон будит звук только по касанию, а после возврата
      // в приложение касания не было. Кнопки с буквами НЕ открываем — ответ вслепую
      // записался бы папе в статистику как настоящий и испортил бы порядок обучения.
      // Выход один и он всегда доступен: «Послушать ещё раз» — это и есть касание.
      if (!played) {
        if (!L.awaiting) {
          $('#fb').textContent = 'Нажмите «Послушать ещё раз»';
          $('#fb').className = 'feedback center';
        }
        return;
      }
      L.locked = false;
      renderOptions(false);
    },
  });
}

function renderOptions(disabled) {
  const box = $('#opts');
  // Раскладка гибкая, последний ряд центрируется — иначе «лишняя» седьмая буква висит одна
  // в углу. При наборе до 4 знаков даём по две в ряд: кнопки крупнее, попасть проще.
  const wide = L.options.length <= 4;
  // disabled здесь = идёт проигрывание знака → мягко гасим кнопки (класс playing).
  box.className = 'options' + (wide ? ' wide' : '') + (disabled ? ' playing' : '');
  box.innerHTML = L.options.map((c) => `<button class="opt" data-c="${esc(c)}" ${disabled ? 'disabled' : ''}>${esc(c)}</button>`).join('');
  [...box.children].forEach((b) => b.addEventListener('click', () => answer(b.dataset.c)));
}

function answer(ch) {
  if (L.locked || L.awaiting) return;
  const correct = ch === L.target;
  const t = track();
  P.recordAnswer(t, L.target, correct, !L.repetition);
  L.answers++; if (correct) L.correct++;
  renderCounter();
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
    // Таймер храним: при выходе из занятия оверлей «Занятие засчитано» держится 1,8 с, и за это
    // время незакрытый таймер успевал начать новый раунд со звуком за спиной оверлея.
    L.nextTimer = setTimeout(() => {
      L.nextTimer = null;
      if (currentTab !== 'learn') return;
      L.awaiting = false;
      if (!afterAnswerProgress(true)) nextRound();
    }, 600);
  } else {
    L.awaiting = true;
    if (chosen) chosen.classList.add('wrong');
    right.classList.add('reveal');
    A.cue('error'); vibrate([20, 40, 20]);
    const info = DATA.charInfo(L.target);
    const chant = state.settings.showChants && state.settings.alphabet === 'ru' && info?.chant ? `<div class="chant">напев: ${esc(info.chant)}</div>` : '';
    screenEl.classList.add('revealing');
    $('#fb').className = 'feedback center no';
    $('#fb').textContent = 'Не угадали';
    // Разбор идёт ПОД сеткой букв, а не над ней. Иначе он раздвигал сетку, и кнопка
    // «Дальше» вставала ровно туда, где только что был палец: дрожащая рука или
    // повторное касание пролистывали разбор, не дав его прочитать.
    $('#reveal').innerHTML = `
      <div class="card reveal">
        <div class="reveal-char">Это «${esc(L.target)}»</div>
        <div class="codeline">${visualCode(codeOf(L.target))}</div>${chant}
        <div class="reveal-actions">
          <button class="btn secondary" id="relisten">${ICON.sound(24)} Послушать</button>
          <button class="btn" id="nextbtn" disabled>Дальше</button>
        </div>
      </div>`;
    $('#relisten').addEventListener('click', () => A.playCode(codeOf(L.target), settingsForPlay(), {}));
    $('#nextbtn').addEventListener('click', () => { if (!afterAnswerProgress(false)) nextRound(); });
    // Короткая задержка: «Дальше» не должна сработать от того же касания или его дребезга.
    L.revealTimer = setTimeout(() => { L.revealTimer = null; const b = $('#nextbtn'); if (b) b.disabled = false; }, 450);
    persist();
  }
}

// Продвижение, вехи, предложение отложить — после ответа (не в режиме повторения).
// Возвращает true, если функция сама берёт на себя переход к следующему знаку
// (показывает событие-оверлей или диалог «отложить») — тогда вызывающий не делает nextRound.
//
// Главное правило: показываем только то, что вызвано ИМЕННО этим ответом. Поощрения
// (новый знак, веха) — исключительно после верного ответа; иначе игра поздравляла с новым
// уровнем сразу после промаха, потому что окно точности всё ещё держалось выше порога.
function afterAnswerProgress(correct) {
  if (L.repetition) return false;
  const t = track(), alpha = state.settings.alphabet;

  // После ошибки уместно единственное событие — предложение отложить трудный знак:
  // оно вызвано этой самой ошибкой, а не «пройденным порогом».
  if (!correct) {
    if (P.shouldOfferPark(t, alpha)) { offerPark(); return true; }
    return false;
  }

  // 1) Открылся новый знак — это событие: показываем героя и ТОЛЬКО ПОТОМ следующий раунд.
  if (P.shouldOpenNext(t, alpha)) {
    const opened = P.openNext(t, alpha);
    const info = DATA.charInfo(opened);
    const chant = state.settings.showChants && alpha === 'ru' && info?.chant ? `, напев «${info.chant}»` : '';
    const newly = G.checkMilestones(state, { triggers: ['chars'] });
    persist();
    showHero('hero-radost.webp', `Открыт новый знак: ${opened}`, `${visualCode(codeOf(opened))}${chant}`, 2400)
      .then(() => (newly.length ? milestoneBanner(newly) : null))
      .then(() => { if (currentTab === 'learn') nextRound(); });
    return true;
  }

  // 2) Знак даётся трудно — предложить отложить (свой поток перехода в offerPark).
  if (P.shouldOfferPark(t, alpha)) { offerPark(); return true; }

  // 3) Веха без нового знака — короткий баннер, затем следующий раунд.
  // Только вехи за знаки: вехи за время и события принадлежат другим моментам.
  const newly = G.checkMilestones(state, { triggers: ['chars'] });
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
  const btn = $('#help');
  if (box.innerHTML) {
    box.innerHTML = '';
    btn.innerHTML = `${ICON.help(22)} Показать коды знаков`;
    return;
  }
  const active = P.activeSet(track(), state.settings.alphabet);
  btn.innerHTML = `${ICON.help(22)} Скрыть коды знаков`;
  box.innerHTML = `<div class="card"><ul class="codelist">${active.map((c) => {
    const info = DATA.charInfo(c);
    const chant = state.settings.showChants && state.settings.alphabet === 'ru' && info?.chant ? `<span class="chant">${esc(info.chant)}</span>` : '';
    return `<li><b>${esc(c)}</b><span class="codeline small">${visualCode(codeOf(c))}</span>${chant}</li>`;
  }).join('')}</ul></div>`;
  // Карточка открывается в самом низу экрана — без прокрутки её просто не видно,
  // и нажатие выглядит как «ничего не произошло».
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Засчитать текущее занятие один раз (≥15 ответов). Вызывается из любого ухода.
// Вехи за время («10 минут в эфире») проверяются здесь: время попадает в totalSeconds
// только при остановке часов, поэтому завершение занятия — их естественный момент.
function finalizeLearnSession() {
  if (!L || L.recorded || L.answers < 15) return false;
  const acc = Math.round(L.correct / L.answers * 100);
  const counted = G.recordSession(state, { answers: L.answers, accuracyPct: acc, todayStr: G.localDate() });
  L.recorded = true;
  L.newMilestones = G.checkMilestones(state);
  persist();
  return counted;
}

function exitLearn() {
  stopActiveClock();
  if (L && L.nextTimer) { clearTimeout(L.nextTimer); L.nextTimer = null; }
  const counted = finalizeLearnSession();
  if (counted && L) {
    const acc = Math.round(L.correct / L.answers * 100);
    const newly = L.newMilestones || [];
    showHero('hero-radost.webp', 'Занятие засчитано', `Ответов: ${L.answers}, точность ${acc}%`, 1800)
      .then(() => milestoneBanner(newly))
      .then(() => { learnOpts.repetition = false; go('home'); });
    return;
  }
  learnOpts.repetition = false;
  go('home');
}

// ——— Спецдрилл «Свой позывной» (§9) ———
function callsignDrill() {
  tabsEl.classList.add('hidden');
  screenEl.innerHTML = `<div class="center intro">
    <h2>Ваш позывной на слух</h2>
    <div class="heroblock"><img class="hero small" src="assets/hero-klyuch.webp" alt=""></div>
    <p class="muted">Сейчас позывной прозвучит целиком, как настоящая радиограмма.
       Все эти коды вы уже знаете.</p>
    <div class="card">
      <div class="callsign">${esc(DATA.CALLSIGN)}</div>
      ${traceHTML(TR.traceSequence(DATA.CALLSIGN_CODES), 'centered')}
    </div>
    <button class="btn" id="play">${ICON.sound(24)} Послушать</button>
    <button class="btn secondary" id="got">${ICON.check(24)} Я принял</button>
    <button class="linkbtn" id="back">Назад</button></div>`;
  $('#play').addEventListener('click', () => A.playSequence(DATA.CALLSIGN_RU_CHARS, (c) => DATA.CODE_BY_CHAR.ru.get(c), state.settings, {}));
  $('#got').addEventListener('click', () => {
    const newly = G.checkMilestones(state, { callsignReceived: true });
    persist();
    showHero('hero-radost.webp', 'Позывной принят!', DATA.CALLSIGN, 2200)
      .then(() => milestoneBanner(newly))
      .then(() => go('home'));
  });
  $('#back').addEventListener('click', () => go('home'));
}

// ——————————————————————————— Ключ (§7.3) ———————————————————————————
let K = null;
function clearKeyTimers() {
  if (!K) return;
  clearTimeout(K.gapTimer); clearTimeout(K.spaceTimer); clearTimeout(K.hintTimer);
  K.gapTimer = K.spaceTimer = K.hintTimer = null;
}

function renderKey() {
  clearKeyTimers();
  if (K && K.detach) K.detach();
  const mode = state.settings.keyMode === 'free' ? 'free' : 'train';
  K = { mode, elements: [], holds: [], detach: null, holdStart: null, gapTimer: null, spaceTimer: null, hintTimer: null, target: null, line: KT.emptyLine() };
  const toggle = `<div class="seg">
      <button data-m="train" class="${mode === 'train' ? 'active' : ''}">Тренировка</button>
      <button data-m="free" class="${mode === 'free' ? 'active' : ''}">Свободно</button>
    </div>`;
  const speedCtl = `
    <div class="slider">
      <div class="slider-head">
        <label for="kspeed">Скорость ключа</label>
        <output class="num" id="kspeed-val">${state.settings.keyWpm}</output>
      </div>
      <input type="range" id="kspeed" min="8" max="18" value="${state.settings.keyWpm}">
      <div class="slider-ends"><span>медленнее</span><span>быстрее</span></div>
    </div>`;

  if (mode === 'train') {
    const order = P.activeSet(track(), state.settings.alphabet);
    K.target = order[Math.floor(Math.random() * order.length)];
    screenEl.innerHTML = `
      <div class="screenbar"><h2>Ключ</h2></div>${toggle}
      <div class="card task">
        <div>
          <div class="eyebrow">Отстучите</div>
          <div class="taskchar">${esc(K.target)}</div>
        </div>
        <button class="btn secondary" id="sample">${ICON.sound(24)} Послушать</button>
      </div>
      <button type="button" class="keypad" id="pad" aria-label="Ключ: нажимайте и держите"><span class="keyout" id="keyout" aria-live="polite">Нажимайте и держите</span></button>
      <div class="keyverdict" id="keychar" aria-live="polite"><div class="muted">Отстучите знак — разберём, что получилось</div></div>
      <button class="linkbtn" id="newtarget">Другой знак</button>${speedCtl}`;
    $('#sample').addEventListener('click', () => A.playCode(codeOf(K.target), { ...state.settings, charWpm: state.settings.keyWpm, effWpm: state.settings.keyWpm }, {}));
    $('#newtarget').addEventListener('click', renderKey);
  } else {
    screenEl.innerHTML = `
      <div class="screenbar"><h2>Ключ</h2></div>${toggle}
      <p class="muted center hint">Отстукивайте — буквы складываются в строку. Пауза подольше — пробел.</p>
      <div class="keytext" id="text"></div>
      <button type="button" class="keypad" id="pad" aria-label="Ключ: нажимайте и держите"><span class="keyout" id="keyout" aria-live="polite">Нажимайте и держите</span></button>
      <div class="btn-row">
        <button class="btn secondary" id="erase">${ICON.erase(24)} Стереть</button>
        <button class="btn secondary" id="clear">${ICON.clear(24)} Очистить</button>
      </div>${speedCtl}`;
    renderKeyLine();
    $('#erase').addEventListener('click', () => { clearKeyTimers(); K.elements = []; K.holds = []; setKeyout('·'); K.line = KT.eraseLast(K.line); renderKeyLine(); vibrate(10); });
    $('#clear').addEventListener('click', () => { clearKeyTimers(); K.elements = []; K.holds = []; setKeyout('·'); K.line = KT.clearLine(); renderKeyLine(); vibrate(10); });
  }

  screenEl.querySelectorAll('.seg [data-m]').forEach((b) =>
    b.addEventListener('click', () => { state.settings.keyMode = b.dataset.m; persist(); renderKey(); }));

  const kspeed = $('#kspeed');
  if (kspeed) kspeed.addEventListener('input', (e) => {
    state.settings.keyWpm = Math.min(18, Math.max(8, Math.round(+e.target.value)));
    persist();
    $('#kspeed-val').textContent = state.settings.keyWpm;
  });

  const pad = $('#pad');
  const down = (e) => {
    e.preventDefault();
    // Захватываем указатель: палец, чуть сползший с площадки во время удержания, продолжает
    // считаться нажатым. Раньше это обрывало тире, и вердикт говорил «вышло Е вместо М»,
    // не намекая, что причина в съехавшем пальце.
    try { pad.setPointerCapture(e.pointerId); } catch {}
    keyPadDown();
  };
  const up = (e) => { e.preventDefault(); keyPadUp(); };
  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  // Страховка на случай, если захват указателя не сработал: отпускание пальца ГДЕ УГОДНО
  // обязано закрыть знак, иначе тон звучит бесконечно, а площадка остаётся вжатой.
  const windowUp = () => { if (K && K.holdStart !== null) keyPadUp(); };
  window.addEventListener('pointerup', windowUp);
  window.addEventListener('pointercancel', windowUp);
  K.detach = () => {
    window.removeEventListener('pointerup', windowUp);
    window.removeEventListener('pointercancel', windowUp);
  };
  // С клавиатуры: пробел или Enter работают как нажатие и удержание. e.repeat отсекает
  // автоповтор, иначе одно удержание превратилось бы в череду точек.
  pad.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); keyPadDown(); }
  });
  pad.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); keyPadUp(); }
  });
  startActiveClock();
}

const KEY_HINT = 'Нажимайте и держите';
// Пока ничего не набрано — площадка подсказывает, что делать; во время набора показывает
// точки и тире прямо в себе.
function setKeyout(s) {
  const el = $('#keyout');
  if (!el) return;
  const empty = !s || s === '·';
  el.textContent = empty ? KEY_HINT : s;
  el.classList.toggle('typing', !empty);
}
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
  K.holds.push(hold);
  setKeyout(K.elements.join(' ').replace(/\./g, '•').replace(/-/g, '—'));
  // ждём паузу конца знака (3·keyDit) → декодируем
  K.gapTimer = setTimeout(() => decodeKey(), th.charGapMin * 1000);
}
function decodeKey() {
  K.gapTimer = null;
  const code = K.elements.join('');
  const holds = K.holds;
  K.elements = []; K.holds = [];
  setKeyout('·');
  const keyDit = keyThresholds(state.settings.keyWpm).keyDit;
  const map = DATA.CODE_BY_CHAR[state.settings.alphabet];
  let found = '?';
  for (const [ch, c] of map.entries()) if (c === code) { found = ch; break; }

  if (K.mode === 'train') {
    const ok = found === K.target;
    const el = $('#keychar');
    // Сравнение ритмов — то, чего на «Ключе» не хватало: видно не просто «неверно»,
    // а ЧЕМ именно отличается — где тире вышло короткое, где лишняя точка.
    if (el) {
      if (found === '?') {
        el.className = 'keyverdict';
        el.innerHTML = `<div class="muted">Такого знака в азбуке нет</div>
          <div class="cmp"><span class="eyebrow">Вышло</span>${traceOfHolds(holds, keyDit)}</div>
          <div class="cmp"><span class="eyebrow">Нужно</span>${traceOfCode(codeOf(K.target))}</div>
          <button class="btn secondary" id="againkey">Отстучать ещё раз</button>`;
      } else if (ok) {
        el.className = 'keyverdict ok';
        el.innerHTML = `<div class="verdict">${ICON.check(26)} Верно — ${esc(found)}</div>
          <button class="btn" id="nextkey">Следующий знак</button>`;
      } else {
        el.className = 'keyverdict no';
        // «Вышло» рисуем по ФАКТИЧЕСКИМ удержаниям: видно, что точка вышла длинной,
        // а не просто «получилась другая буква».
        el.innerHTML = `<div class="verdict">Вышло «${esc(found)}», а нужно «${esc(K.target)}»</div>
          <div class="cmp"><span class="eyebrow">Вышло</span>${traceOfHolds(holds, keyDit)}</div>
          <div class="cmp"><span class="eyebrow">Нужно</span>${traceOfCode(codeOf(K.target))}</div>
          <button class="btn secondary" id="againkey">Отстучать ещё раз</button>`;
      }
      $('#nextkey')?.addEventListener('click', renderKey);
      $('#againkey')?.addEventListener('click', () => {
        const box = $('#keychar');
        box.className = 'keyverdict';
        box.innerHTML = '<div class="muted">Отстучите знак заново</div>';
      });
    }
    if (ok) { A.cue('success'); vibrate(40); }
    return;
  }

  // Свободный режим.
  if (found === '?') { setKeyout('?'); K.hintTimer = setTimeout(() => { K.hintTimer = null; setKeyout('·'); }, 600); return; }
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
    <div class="screenbar"><h2>Азбука</h2></div>
    <p class="muted hint">Нажмите на знак, чтобы послушать его.</p>
    <div class="seg">
      <button data-a="ru" class="${refAlpha === 'ru' ? 'active' : ''}">Русская</button>
      <button data-a="en" class="${refAlpha === 'en' ? 'active' : ''}">English</button>
    </div>
    <div class="seg">
      <button data-s="letters" class="${refSection === 'letters' ? 'active' : ''}">Буквы</button>
      <button data-s="digits" class="${refSection === 'digits' ? 'active' : ''}">Цифры</button>
      <button data-s="punct" class="${refSection === 'punct' ? 'active' : ''}">Знаки</button>
    </div>
    <div class="grid" id="grid">${items.map((it) => `
      <button class="cell" data-c="${esc(it.char)}">
        <span>${esc(it.char)}</span>
        <small>${visualCode(it.code)}</small>
        ${it.name ? `<span class="cellname">${esc(it.name)}</span>` : ''}
      </button>`).join('')}</div>
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
    <button class="closebtn" id="x" aria-label="Закрыть">✕</button>
    <div class="bigchar">${esc(ch)}</div>
    ${info.name ? `<div class="cardname">${esc(info.name)}</div>` : ''}
    ${traceOfCode(code, 'big centered')}
    <div class="codeline">${visualCode(code)}</div>
    ${chant}
    <button class="btn" id="play" style="max-width:260px">${ICON.sound(24)} Послушать</button></div>`;
  const playSettings = () => DATA.DIGITS.some((d) => d.char === ch)
    ? { ...state.settings } : { ...state.settings, alphabet: refAlpha };
  $('#play').addEventListener('click', () => A.playCode(code, playSettings(), {}));
  $('#x').addEventListener('click', () => { overlayRoot.innerHTML = ''; });
  overlayRoot.firstElementChild.addEventListener('click', (e) => { if (e.target === overlayRoot.firstElementChild) overlayRoot.innerHTML = ''; });
}

// ——————————————————————————— Кабинет «Бортжурнал» (§7.5) ———————————————————————————
// ——— Поддержать проект и написать автору ———
// Оба блока показываются, только если задан адрес (app/js/support.js). Пока адреса нет —
// их нет вовсе: приложение обновляется само, и мёртвая кнопка на телефоне выглядела бы
// поломкой. Никаких всплывающих окон: это спокойные элементы внутри экранов.

// Тихая строка на главной. Не кнопка-призыв, а ссылка, которую легко пройти мимо.
function supportLine() {
  const url = donateUrl();
  if (!url) return '';
  return `<a class="linkbtn" id="support-line" href="${esc(url)}" target="_blank" rel="noopener">
    ${ICON.heart(22)} Поддержать проект</a>`;
}

// Карточка в «Журнале» — после вех, когда человек только что посмотрел свои успехи.
function supportCard() {
  const url = donateUrl();
  if (!url) return '';
  return `<div class="card center support">
    <img class="avatar big" src="assets/hero-radost.webp" alt="">
    <div class="eyebrow" style="margin-top:8px">Если пригодилось</div>
    <p>Приложение бесплатное и таким останется: без рекламы, без подписки
       и без сбора данных. Если оно вам полезно — можно сказать спасибо
       переводом на любую сумму, которая вам удобна.</p>
    <p class="muted hint">Ничего не изменится, если вы этого не сделаете.</p>
    <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${ICON.heart(24)} Поддержать</a>
    <p class="muted hint" style="margin:12px 0 0">Откроется страница перевода:
       карта или СБП, сумму вы вписываете сами.</p>
  </div>`;
}

// Форма обратной связи. Отправляется на приёмник (см. support.js), а не в телеграм
// напрямую: токен бота в приложении держать нельзя.
function feedbackCard() {
  if (!feedbackUrl()) return '';
  return `<div class="card" id="feedback">
    <div class="eyebrow">Написать автору</div>
    <p class="muted hint">Что удобно, что мешает, чего не хватает — всё пригодится.
       Отвечает живой человек.</p>
    <label for="fb-msg">Сообщение</label>
    <textarea id="fb-msg" maxlength="${MESSAGE_MAX}" rows="4"
      placeholder="Например: хочу, чтобы буквы можно было повторять по одной"></textarea>
    <label for="fb-name">Как вас зовут <span class="muted">— необязательно</span></label>
    <input type="text" id="fb-name" maxlength="${NAME_MAX}" placeholder="чтобы ответить по имени">
    <label for="fb-who">Как с вами связаться <span class="muted">— если ждёте ответа</span></label>
    <input type="text" id="fb-who" maxlength="${CONTACT_MAX}" placeholder="почта или телеграм">
    <button class="btn secondary" id="fb-send">${ICON.send(24)} Отправить</button>
    <p class="fb-status" id="fb-status" role="status" aria-live="polite"></p>
  </div>`;
}

// Отправка письма. Всё, что уходит наружу, — только то, что человек написал сам:
// ни прогресса, ни позывного, ни настроек. Текст при неудаче остаётся в поле.
function wireFeedback() {
  const url = feedbackUrl();
  const btn = $('#fb-send');
  if (!url || !btn) return;
  const status = $('#fb-status');
  const say = (text, kind = '') => { status.textContent = text; status.className = `fb-status ${kind}`; };

  btn.addEventListener('click', async () => {
    const check = validateFeedback({ message: $('#fb-msg').value, contact: $('#fb-who').value });
    const name = $('#fb-name').value.trim().slice(0, NAME_MAX);
    if (!check.ok) { say(check.error, 'no'); return; }
    if (navigator.onLine === false) {
      say('Нет интернета. Текст никуда не денется — отправьте, когда появится связь.', 'no');
      return;
    }
    btn.disabled = true;
    say('Отправляю…');
    // Срок ожидания обязателен: без него зависший сервер оставит кнопку навсегда
    // выключенной с надписью «Отправляю…», и человек решит, что приложение сломалось.
    // AbortController, а не AbortSignal.timeout — он работает и на старых айфонах.
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: check.message, name, contact: check.contact, from: 'app' }),
        signal: stop.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      $('#feedback').innerHTML = `<div class="eyebrow">Написать автору</div>
        <p class="fb-status ok">${ICON.check(24)} Письмо ушло. Спасибо — это правда помогает.</p>`;
    } catch {
      btn.disabled = false;
      say('Не получилось отправить. Проверьте связь и попробуйте ещё раз — текст сохранён.', 'no');
    } finally {
      clearTimeout(timer);
    }
  });
}

function renderCabinet() {
  const t = track();
  const rank = G.rankFor(t.learnedCount, G.avgAccuracy(t));
  const s = state.settings;
  const ms = Object.values(G.MILESTONES).map((m) => {
    const done = !!state.milestones[m.id];
    return `<li class="${done ? 'done' : ''}"><span>${esc(m.title)}</span>
      <span class="mark" aria-label="${done ? 'получена' : 'ещё не получена'}">${done ? ICON.check(24) : '—'}</span></li>`;
  }).join('');
  const hist = state.history.slice(-10).reverse().map((h) => `<li><span>${esc(G.formatDate(h.date))}</span><span class="muted">${h.answers} ответов · ${h.accuracyPct}%</span></li>`).join('') || '<li class="muted">пока пусто</li>';
  // Журнал был одной длинной простынёй: успехи, настройки и профиль вперемешку. Разбит по
  // смыслу — сначала то, чем гордиться, потом кто ты в эфире, потом настройки.
  const themeBtn = (id, mode, icon, label) =>
    `<button id="${id}" class="${s.theme === mode ? 'active' : ''}">${icon}<span>${label}</span></button>`;
  screenEl.innerHTML = `
    <div class="screenbar"><h2>Журнал</h2></div>
    <div class="card center">
      <img class="avatar big" src="assets/hero-portret.webp" alt="">
      <div class="odometer">${state.profile.points}</div>
      <div class="eyebrow">очков опыта</div>
      <p class="muted hint" style="margin-top:6px">По очку за верный ответ и по десять за веху.
         Просто счётчик работы — на звание не влияет.</p>
      <div class="rankline">${esc(rank)}</div>
    </div>
    <div class="card">
      <div class="eyebrow">Мои успехи</div>
      <ul class="list">
        <li><span>Освоено букв</span><span class="num">${t.learnedCount} / 32</span></li>
        <li><span>Освоено цифр</span><span class="num">${t.digitsLearned} / 10</span></li>
        <li><span>Дней подряд сейчас</span><span class="num">${state.streak.current}</span></li>
        <li><span>Лучший результат</span><span class="num">${state.streak.longest} дн.</span></li>
        <li><span>Всего в эфире</span><span class="num">${Math.round(state.totalSeconds / 60)} мин</span></li>
      </ul>
    </div>
    <div class="card"><div class="eyebrow">Занятия</div><ul class="list">${hist}</ul></div>
    <div class="card"><div class="eyebrow">Вехи</div><ul class="list milestones">${ms}</ul></div>
    ${supportCard()}
    <div class="card">
      <div class="eyebrow">Кто вы в эфире</div>
      <label for="name">Имя</label><input type="text" id="name" value="${esc(state.profile.name)}">
      <label for="callsign">Позывной</label><input type="text" id="callsign" value="${esc(state.profile.callsign)}">
    </div>
    <div class="card">
      <div class="eyebrow">Оформление</div>
      <div class="seg icons" style="margin-bottom:0">
        ${themeBtn('theme-auto', 'auto', ICON.auto(22), 'Как в телефоне')}
        ${themeBtn('theme-light', 'light', ICON.sun(22), 'Светлое')}
        ${themeBtn('theme-dark', 'dark', ICON.moon(22), 'Тёмное')}
      </div>
    </div>
    <div class="card">
      <div class="eyebrow">Чему учимся</div>
      <p class="muted hint">Это меняет сам курс: прогресс по русской и латинской азбуке
         считается отдельно. В «Азбуке» переключатель показывает лишь таблицу и на курс не влияет.</p>
      <div class="seg" style="margin-bottom:0">
        <button id="lang-ru" class="${s.alphabet === 'ru' ? 'active' : ''}">Русская азбука</button>
        <button id="lang-en" class="${s.alphabet === 'en' ? 'active' : ''}">Латинская (English)</button>
      </div>
    </div>
    <div class="card">
      <div class="eyebrow">Звук</div>
      <label for="eff">Скорость морзянки <output class="num">${s.effWpm}</output></label>
      <input type="range" id="eff" min="5" max="15" value="${Math.min(15, s.effWpm)}">
      <label for="tone">Высота тона <output class="num">${s.toneHz} Гц</output></label>
      <input type="range" id="tone" min="500" max="800" step="10" value="${s.toneHz}">
      <label for="vol">Громкость</label>
      <input type="range" id="vol" min="0.15" max="1" step="0.05" value="${Math.max(0.15, s.volume)}">
      <label for="key">Скорость ключа <output class="num">${s.keyWpm}</output></label>
      <input type="range" id="key" min="8" max="18" value="${s.keyWpm}">
    </div>
    <div class="card">
      <div class="eyebrow">Помощь при обучении</div>
      <div class="rowflex">
        <span>Напевы букв: <b>${s.showChants ? 'включены' : 'выключены'}</b></span>
        <button class="btn secondary switch" id="chants">${s.showChants ? 'Выключить' : 'Включить'}</button>
      </div>
      <div class="rowflex">
        <span>Вибрация при нажатии: <b>${s.vibration ? 'включена' : 'выключена'}</b></span>
        <button class="btn secondary switch" id="vib">${s.vibration ? 'Выключить' : 'Включить'}</button>
      </div>
    </div>
    <div class="card">
      <div class="eyebrow">Резервная копия</div>
      <p class="muted hint">Прогресс хранится в самом телефоне. «Сохранить копию» скачает файл
         в папку загрузок — его стоит переслать себе на почту. Если телефон сменится,
         этим файлом прогресс возвращается.</p>
      <button class="btn secondary" id="backup">${ICON.save(24)} Сохранить копию</button>
      <button class="btn secondary" id="restore">${ICON.restore(24)} Восстановить из копии</button>
      <input type="file" id="file" accept="application/json" class="hidden">
    </div>
    ${feedbackCard()}
    <button class="linkbtn danger" id="reset">Начать обучение заново</button>`;
  wireFeedback();
  ['auto', 'light', 'dark'].forEach((mode) => {
    $(`#theme-${mode}`).addEventListener('click', () => {
      s.theme = mode; persist(); applyTheme(); renderCabinet();
    });
  });
  const saveProfile = () => { state.profile.name = $('#name').value.trim() || state.profile.name; state.profile.callsign = $('#callsign').value.trim() || 'Boney M'; persist(); };
  $('#name').addEventListener('change', saveProfile);
  $('#callsign').addEventListener('change', saveProfile);
  $('#eff').addEventListener('input', (e) => { s.effWpm = clampEff(+e.target.value, s.charWpm); persist(); });
  $('#tone').addEventListener('input', (e) => { s.toneHz = +e.target.value; persist(); });
  $('#vol').addEventListener('input', (e) => { s.volume = +e.target.value; persist(); });
  $('#key').addEventListener('input', (e) => { s.keyWpm = +e.target.value; persist(); });
  $('#tone').addEventListener('change', () => A.playCode('-.-', state.settings, {}));
  $('#vol').addEventListener('change', () => A.playCode('-.-', state.settings, {}));
  $('#chants').addEventListener('click', () => { s.showChants = !s.showChants; persist(); renderCabinet(); });
  $('#vib').addEventListener('click', () => { s.vibration = !s.vibration; persist(); renderCabinet(); });
  $('#lang-ru').addEventListener('click', () => { s.alphabet = 'ru'; persist(); renderCabinet(); });
  $('#lang-en').addEventListener('click', () => { s.alphabet = 'en'; persist(); renderCabinet(); });
  $('#backup').addEventListener('click', doBackup);
  $('#restore').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', doRestore);
  $('#reset').addEventListener('click', () => {
    if (confirm('Начать обучение заново? Все освоенные знаки и журнал занятий будут удалены. Это не отменить.')) {
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
  if (document.hidden) {
    A.stopAll(); stopActiveClock();
    if (currentTab === 'key') {
      clearKeyTimers();
      if (K) { K.holdStart = null; K.elements = []; K.holds = []; }
      // Иначе площадка остаётся визуально вжатой и «залипшей» после возврата.
      $('#pad')?.classList.remove('down');
      setKeyout('·');
    }
  }
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
applyTheme();
if (needsOnboarding(state)) renderOnboarding();
else {
  // У тех, кто уже занимался прежней версией, заслуженные вехи могли не записаться.
  // Доначисляем их ТИХО при запуске: иначе они выпадут баннером «Новая веха!» посреди
  // занятия — за то, что человек сделал месяц назад.
  G.checkMilestones(state, { triggers: ['chars'] });
  persist();
  go('home');
}
