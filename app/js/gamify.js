// Геймификация: ранги, серия дней, вехи, очки, сессии (ТЗ §8, §7.2, §9).
// Только неконкурентные поощрения. Никаких «жизней», таймеров, рейтингов.
import { CALLSIGN_RU_CHARS, KOCH_ORDER_RU, RU_LETTERS } from './data.js';

// §8: ранги по числу освоенных букв (learnedCount из 32).
export function rankFor(learnedCount, avgAccuracy) {
  if (learnedCount >= 32 && avgAccuracy >= 0.90) return 'Мастер ключа';
  if (learnedCount >= 26) return 'Опытный оператор';
  if (learnedCount >= 18) return 'Уверенный приём';
  if (learnedCount >= 10) return 'Радист';
  if (learnedCount >= 4) return 'Юный радист';
  return 'Первый сигнал';
}

// Средняя точность по всем знакам трека (для ранга «Мастер ключа» и журнала).
export function avgAccuracy(track) {
  let c = 0, t = 0;
  for (const k of Object.keys(track.perChar)) {
    c += track.perChar[k].correct;
    t += track.perChar[k].total;
  }
  return t ? c / t : 0;
}

// Локальная дата YYYY-MM-DD.
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayDiff(fromStr, toStr) {
  const a = Date.parse(`${fromStr}T00:00:00Z`);
  const b = Date.parse(`${toStr}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// §8: обновление серии «дней в эфире». Без укоряющих сообщений при пропуске.
export function updateStreak(streak, todayStr) {
  const s = { ...streak };
  if (s.lastActiveDate === todayStr) {
    // та же дата — ничего не менять
  } else if (s.lastActiveDate && dayDiff(s.lastActiveDate, todayStr) === 1) {
    s.current += 1; // ровно вчера
  } else {
    s.current = 1; // старше или null
  }
  s.longest = Math.max(s.longest, s.current);
  s.lastActiveDate = todayStr;
  return s;
}

// §9: спецдрилл «Boney M» доступен, когда освоены коды Б,О,Н,Е,Ы,М (русский трек).
export function callsignDrillAvailable(track) {
  const learned = KOCH_ORDER_RU.slice(0, track.learnedCount || 0);
  return CALLSIGN_RU_CHARS.every((c) => learned.includes(c));
}

// §8: список вех. Возвращает массив id вновь полученных (и отмечает их + начисляет очки).
export const MILESTONES = {
  first4:    { id: 'first4',    title: 'Освоены первые 4 знака' },
  tenMin:    { id: 'tenMin',    title: '10 минут в эфире' },
  callsign:  { id: 'callsign',  title: 'Принят на слух свой позывной' },
  allDigits: { id: 'allDigits', title: 'Освоены все цифры' },
  half:      { id: 'half',      title: 'Освоена половина алфавита' },
  full:      { id: 'full',      title: 'Освоен весь алфавит' },
};

export function checkMilestones(state, ctx = {}) {
  const track = state.progress[state.settings.alphabet];
  const ms = state.milestones;
  const newly = [];
  const grant = (id) => { if (!ms[id]) { ms[id] = true; newly.push(id); state.profile.points += 10; } };

  if ((track.learnedCount || 0) >= 4) grant('first4');
  if ((state.totalSeconds || 0) >= 600) grant('tenMin');
  if ((track.digitsLearned || 0) >= 10) grant('allDigits');
  if ((track.learnedCount || 0) >= 16) grant('half');
  if ((track.learnedCount || 0) >= 32) grant('full');
  if (ctx.callsignReceived) grant('callsign');
  return newly;
}

// §8: +1 очко за верный ответ.
export function awardCorrect(state) {
  state.profile.points += 1;
}

// §7.2: завершённая сессия = >= 15 ответов. Обновляет серию и журнал.
// Возвращает true, если сессия засчитана.
export function recordSession(state, { answers, accuracyPct, todayStr }) {
  if (answers < 15) return false;
  state.streak = updateStreak(state.streak, todayStr);
  state.history.push({ date: todayStr, answers, accuracyPct });
  if (state.history.length > 30) state.history = state.history.slice(-30);
  return true;
}

// Активное время практики (суммируется всегда; паузится при уходе со вкладки — §7.2).
export function addActiveTime(state, seconds) {
  state.totalSeconds = (state.totalSeconds || 0) + Math.max(0, seconds);
}

export const TOTAL_LETTERS = RU_LETTERS.length; // 32
