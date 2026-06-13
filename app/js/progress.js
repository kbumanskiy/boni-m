// Методика Коха: рост активного набора, правило продвижения, отложенные знаки,
// подмешивание цифр, подбор знаков для викторины (ТЗ §6, §6.1, §7.2).
import { KOCH_ORDER_RU, KOCH_ORDER_EN, DIGIT_ORDER, START_SET_SIZE } from './data.js';

// Правило §6.
const WINDOW = 30;          // скользящее окно последних ответов
const OVERALL_ACC = 0.90;   // общая точность по набору
const NEWEST_MIN_ANSWERS = 10;
const NEWEST_ACC = 0.85;
// Правило «отложить» §6.1.
const PARK_AFTER = 20;      // попыток
const PARK_ACC = 0.70;      // ниже этой точности — предложить отложить
const PARK_RETURN_AFTER = 3; // вернуть отложенный через столько новых знаков
const DIGITS_AFTER_LETTERS = 20; // цифры подмешиваются после 20 букв (§6)

export function letterOrder(alphabet) {
  return alphabet === 'en' ? KOCH_ORDER_EN : KOCH_ORDER_RU;
}

// Единый порядок открытия: первые 20 букв, затем чередование оставшихся букв и цифр.
// Даёт ровно один «новейший» знак за раз и плавно подмешивает цифры (решение Кости).
export function combinedOrder(alphabet) {
  const letters = letterOrder(alphabet);
  const out = letters.slice(0, DIGITS_AFTER_LETTERS);
  const restLetters = letters.slice(DIGITS_AFTER_LETTERS);
  const digits = DIGIT_ORDER;
  let i = 0, j = 0;
  while (i < restLetters.length || j < digits.length) {
    if (i < restLetters.length) out.push(restLetters[i++]);
    if (j < digits.length) out.push(digits[j++]);
  }
  return out;
}

const isDigit = (ch) => ch >= '0' && ch <= '9';

// Сколько знаков открыто всего (буквы + цифры).
export function openedCount(track) {
  return (track.learnedCount || 0) + (track.digitsLearned || 0);
}

// Гарантировать стартовый набор из 4 знаков при первом входе.
export function ensureStarted(track) {
  if (openedCount(track) < START_SET_SIZE) {
    track.learnedCount = START_SET_SIZE;
    track.digitsLearned = 0;
  }
  return track;
}

// Освежить отложенные: вернуть в ротацию тех, чей срок возврата наступил.
function refreshParked(track) {
  const n = openedCount(track);
  track.parked = (track.parked || []).filter((p) => p.returnAt > n);
}

// Активный набор знаков (открытые минус отложенные).
export function activeSet(track, alphabet) {
  ensureStarted(track);
  refreshParked(track);
  const order = combinedOrder(alphabet);
  const opened = order.slice(0, openedCount(track));
  const parkedChars = new Set((track.parked || []).map((p) => p.char));
  return opened.filter((c) => !parkedChars.has(c));
}

// Новейший знак — последний активный по порядку (на него смотрит правило §6).
export function newestChar(track, alphabet) {
  const active = activeSet(track, alphabet);
  return active.length ? active[active.length - 1] : null;
}

// Записать ответ. countTowardGate=false для режима «Повторение» (не двигает правило §6.1 п.2).
export function recordAnswer(track, char, correct, countTowardGate = true) {
  if (!track.perChar[char]) track.perChar[char] = { correct: 0, total: 0 };
  track.perChar[char].total += 1;
  if (correct) track.perChar[char].correct += 1;
  if (countTowardGate) {
    track.recent.push(correct ? 1 : 0);
    if (track.recent.length > WINDOW) track.recent = track.recent.slice(-WINDOW);
  }
}

function acc(pc) {
  return pc && pc.total ? pc.correct / pc.total : 0;
}

// Правило продвижения §6: открыть новый знак, когда выполнены ОБА условия.
export function shouldOpenNext(track, alphabet) {
  const order = combinedOrder(alphabet);
  if (openedCount(track) >= order.length) return false; // всё открыто
  // Условие 1: общая точность по последним 30 ответам >= 90%
  const win = track.recent.slice(-WINDOW);
  if (win.length === 0) return false;
  const overall = win.reduce((s, x) => s + x, 0) / win.length;
  if (overall < OVERALL_ACC) return false;
  // Условие 2: новейший знак отвечен >= 10 раз и его точность >= 85%
  const newest = newestChar(track, alphabet);
  const pc = track.perChar[newest];
  if (!pc || pc.total < NEWEST_MIN_ANSWERS) return false;
  return acc(pc) >= NEWEST_ACC;
}

// Открыть следующий знак. Возвращает открытый символ или null.
export function openNext(track, alphabet) {
  const order = combinedOrder(alphabet);
  const n = openedCount(track);
  if (n >= order.length) return null;
  const ch = order[n];
  if (isDigit(ch)) track.digitsLearned += 1;
  else track.learnedCount += 1;
  return ch;
}

// §6.1 п.3: предложить отложить новейший знак, если буксует (>=20 попыток, точность <70%).
export function shouldOfferPark(track, alphabet) {
  if ((track.parked || []).length >= 2) return false; // одновременно не более двух
  const newest = newestChar(track, alphabet);
  const pc = track.perChar[newest];
  if (!pc || pc.total < PARK_AFTER) return false;
  // нельзя отложить, если открывать уже нечего
  if (openedCount(track) >= combinedOrder(alphabet).length) return false;
  return acc(pc) < PARK_ACC;
}

// Отложить новейший знак: убрать из ротации, открыть следующий, вернуть позже.
export function parkNewest(track, alphabet) {
  const newest = newestChar(track, alphabet);
  if (!newest) return null;
  const opened = openNext(track, alphabet); // открываем следующий
  track.parked = track.parked || [];
  track.parked.push({ char: newest, returnAt: openedCount(track) + PARK_RETURN_AFTER });
  return { parked: newest, opened };
}

// ——— Подбор знаков для викторины (§7.2) ———
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Выбрать цель: случайно из набора, с уклоном к новейшему, но не одна и та же цель >2 раз подряд.
export function pickTarget(active, recentTargets, newest, rng = Math.random) {
  let pool = active.slice();
  // Запрет третьего повтора подряд.
  const last2 = recentTargets.slice(-2);
  if (last2.length === 2 && last2[0] === last2[1]) {
    pool = pool.filter((c) => c !== last2[0]);
  }
  if (pool.length === 0) pool = active.slice();
  // Уклон к новейшему: добавим его в пул дополнительным весом.
  if (newest && pool.includes(newest)) pool = pool.concat([newest, newest]);
  return pool[Math.floor(rng() * pool.length)];
}

// Сформировать кнопки-варианты: всегда >=4; при наборе >8 — 6–8 с обязательными целью и новейшим.
export function buildOptions(active, target, newest, rng = Math.random) {
  if (active.length <= 8) {
    return shuffle(active, rng); // показываем весь набор (>=4), позиция цели случайна
  }
  const count = 6 + Math.floor(rng() * 3); // 6..8
  const must = new Set([target]);
  if (newest) must.add(newest);
  const others = shuffle(active.filter((c) => !must.has(c)), rng);
  const opts = Array.from(must);
  for (const c of others) {
    if (opts.length >= count) break;
    opts.push(c);
  }
  return shuffle(opts, rng);
}
