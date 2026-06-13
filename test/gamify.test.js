// Тесты геймификации (ТЗ §8, §7.2, §9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../app/js/state.js';
import {
  rankFor, updateStreak, callsignDrillAvailable, checkMilestones,
  recordSession, awardCorrect, addActiveTime, avgAccuracy,
} from '../app/js/gamify.js';

test('§8: ранги по числу освоенных букв', () => {
  assert.equal(rankFor(0, 1), 'Первый сигнал');
  assert.equal(rankFor(4, 1), 'Юный радист');
  assert.equal(rankFor(10, 1), 'Радист');
  assert.equal(rankFor(18, 1), 'Уверенный приём');
  assert.equal(rankFor(26, 1), 'Опытный оператор');
  assert.equal(rankFor(32, 0.95), 'Мастер ключа');
  assert.equal(rankFor(32, 0.80), 'Опытный оператор', 'без 90% точности не Мастер');
});

test('§8: серия дней растёт на следующий день, держится в тот же день', () => {
  let s = { current: 0, longest: 0, lastActiveDate: null };
  s = updateStreak(s, '2026-06-13');
  assert.deepEqual([s.current, s.longest, s.lastActiveDate], [1, 1, '2026-06-13']);
  s = updateStreak(s, '2026-06-13'); // тот же день
  assert.equal(s.current, 1);
  s = updateStreak(s, '2026-06-14'); // следующий день
  assert.equal(s.current, 2);
  assert.equal(s.longest, 2);
});

test('§8: пропуск дня сбрасывает серию без наказания, лучшая сохраняется', () => {
  let s = { current: 5, longest: 5, lastActiveDate: '2026-06-10' };
  s = updateStreak(s, '2026-06-13'); // пропущено 2 дня
  assert.equal(s.current, 1, 'серия сброшена на 1');
  assert.equal(s.longest, 5, 'лучшая серия сохранена');
});

test('§9: спецдрилл позывного доступен после освоения Б,О,Н,Е,Ы,М', () => {
  const t = defaultState().progress.ru;
  t.learnedCount = 20; // Ы ещё не открыт (Ы на 21-й позиции)
  assert.equal(callsignDrillAvailable(t), false);
  t.learnedCount = 21; // Ы открыт → все коды позывного освоены
  assert.equal(callsignDrillAvailable(t), true);
});

test('§8: вехи начисляются один раз и дают +10 очков', () => {
  const st = defaultState();
  st.progress.ru.learnedCount = 4;
  let newly = checkMilestones(st);
  assert.ok(newly.includes('first4'));
  assert.equal(st.profile.points, 10);
  // повторно — не начисляется
  newly = checkMilestones(st);
  assert.equal(newly.length, 0);
  assert.equal(st.profile.points, 10);
});

test('§8: вехи половины/полного алфавита, цифр, времени, позывного', () => {
  const st = defaultState();
  st.progress.ru.learnedCount = 16;
  st.progress.ru.digitsLearned = 10;
  st.totalSeconds = 600;
  const newly = checkMilestones(st, { callsignReceived: true });
  assert.ok(newly.includes('half'));
  assert.ok(newly.includes('allDigits'));
  assert.ok(newly.includes('tenMin'));
  assert.ok(newly.includes('callsign'));
  assert.ok(newly.includes('first4')); // learnedCount=16 тоже проходит порог 4
  assert.equal(st.profile.points, 50); // first4, half, allDigits, tenMin, callsign = 5 * 10
});

test('§7.2: сессия <15 ответов не засчитывается; >=15 — пишет журнал и серию', () => {
  const st = defaultState();
  assert.equal(recordSession(st, { answers: 14, accuracyPct: 90, todayStr: '2026-06-13' }), false);
  assert.equal(st.history.length, 0);
  assert.equal(recordSession(st, { answers: 20, accuracyPct: 88, todayStr: '2026-06-13' }), true);
  assert.equal(st.history.length, 1);
  assert.equal(st.streak.current, 1);
  assert.deepEqual(st.history[0], { date: '2026-06-13', answers: 20, accuracyPct: 88 });
});

test('очки: +1 за верный ответ; время копится; средняя точность считается', () => {
  const st = defaultState();
  awardCorrect(st); awardCorrect(st);
  assert.equal(st.profile.points, 2);
  addActiveTime(st, 30); addActiveTime(st, 15);
  assert.equal(st.totalSeconds, 45);
  st.progress.ru.perChar = { 'Е': { correct: 9, total: 10 }, 'Т': { correct: 8, total: 10 } };
  assert.ok(Math.abs(avgAccuracy(st.progress.ru) - 0.85) < 1e-9);
});
