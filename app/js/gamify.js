// Геймификация: ранги, серия дней, вехи, очки, сессии (ТЗ §8, §7.2, §9).
// Только неконкурентные поощрения. Никаких «жизней», таймеров, рейтингов.
import { KOCH_ORDER_RU, KOCH_ORDER_EN, DIGIT_ORDER, CODE_BY_CHAR, RU_LETTERS } from './data.js';
import { callsignAvailable } from './callsign.js';

// §8: ранги по числу освоенных букв (learnedCount из 32).
// «Юный радист» убран намеренно: первое, что видел под шильдиком «ЗВАНИЕ» человек 73 лет
// с настоящим позывным и стажем. Звания теперь про этап обучения, а не про возраст.
// «Уверенный приём» тоже заменён — это описание навыка, а не звание.
export function rankFor(learnedCount, avgAccuracy) {
  if (learnedCount >= 32 && avgAccuracy >= 0.90) return 'Мастер ключа';
  if (learnedCount >= 26) return 'Опытный оператор';
  if (learnedCount >= 18) return 'Уверенный оператор';
  if (learnedCount >= 10) return 'Радист';
  if (learnedCount >= 4) return 'Стажёр эфира';
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

// Дата по-человечески: «30 июля», с годом — только если он не текущий. Машинное
// «2026-07-30» в журнале читать неприятно, а папе он нужен каждый день.
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function formatDate(dateStr, todayStr = localDate()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
  if (!m) return String(dateStr);
  const [, year, month, day] = m;
  const name = MONTHS[Number(month) - 1];
  if (!name) return String(dateStr);
  const sameYear = todayStr.slice(0, 4) === year;
  return `${Number(day)} ${name}${sameYear ? '' : ' ' + year}`;
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

// §9: упражнение «свой позывной» открыто, когда освоены все коды, из которых он состоит.
// Считаем по КОДАМ: позывной пишется латиницей, а курс чаще русский, и код у Б и B общий.
// Раньше здесь был жёстко зашит «Boney M» — позывной папы; с форума справедливо
// заметили, что у них он другой.
export function callsignDrillAvailable(track, alphabet, callsign) {
  const order = alphabet === 'en' ? KOCH_ORDER_EN : KOCH_ORDER_RU;
  const learnedChars = [
    ...order.slice(0, track.learnedCount || 0),
    ...DIGIT_ORDER.slice(0, track.digitsLearned || 0),
  ];
  const lookup = (ch) => CODE_BY_CHAR.en.get(ch) || CODE_BY_CHAR.ru.get(ch);
  const learnedCodes = new Set(learnedChars.map(lookup).filter(Boolean));
  return callsignAvailable(callsign, lookup, learnedCodes);
}

// §8: список вех. У каждой указан источник (trigger) — от чего она зависит:
//   'chars' — от числа освоенных знаков, 'time' — от времени в эфире, 'event' — от действия.
// Источник важен: во время викторины можно показывать только вехи за знаки, иначе игра
// объявляет «Новая веха!» в момент, никак не связанный с только что данным ответом.
export const MILESTONES = {
  first4:    { id: 'first4',    title: 'Освоены первые 4 знака',         trigger: 'chars' },
  tenMin:    { id: 'tenMin',    title: '10 минут в эфире',               trigger: 'time' },
  callsign:  { id: 'callsign',  title: 'Принят на слух свой позывной',   trigger: 'event' },
  allDigits: { id: 'allDigits', title: 'Освоены все цифры',              trigger: 'chars' },
  half:      { id: 'half',      title: 'Освоена половина алфавита',      trigger: 'chars' },
  full:      { id: 'full',      title: 'Освоен весь алфавит',            trigger: 'chars' },
};

// Возвращает массив id вновь полученных вех (и отмечает их + начисляет очки).
// ctx.triggers — какие источники учитывать; по умолчанию все.
export function checkMilestones(state, ctx = {}) {
  const track = state.progress[state.settings.alphabet];
  const ms = state.milestones;
  const allow = ctx.triggers || ['chars', 'time', 'event'];
  const newly = [];
  const grant = (id) => {
    if (!allow.includes(MILESTONES[id].trigger)) return;
    if (!ms[id]) { ms[id] = true; newly.push(id); state.profile.points += 10; }
  };

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
