// Тайминг Морзе — стандарт PARIS + растяжка Фарнсуорта (ТЗ §5).
// Все формулы реализованы ровно как в ТЗ. Менять нельзя без сверки.

// Базовые соотношения: тире = 3 точки; пауза между элементами = 1 точка;
// между знаками = 3 точки; между словами = 7 точек.

export const DEFAULTS = {
  charWpm: 18, // C — скорость самих знаков (Кох)
  effWpm: 9,   // E — эффективная скорость (Фарнсуорт), всегда E <= C
  keyWpm: 12,  // отдельная медленная скорость для режима «Ключ»
};

// §5/§13: интерфейс физически не даёт выставить E > C.
export function clampEff(effWpm, charWpm) {
  return Math.min(effWpm, charWpm);
}

// Длительность точки (сек) на скорости знаков C.
export function ditSeconds(charWpm) {
  return 1.2 / charWpm;
}

// Полный набор длительностей (в секундах) для C и E.
export function charTiming(charWpm, effWpm) {
  const C = charWpm;
  const E = clampEff(effWpm, charWpm);
  const dit = 1.2 / C;
  const dah = 3 * dit;
  const intraGap = dit; // пауза между элементами внутри знака

  let charGap, wordGap;
  if (E >= C) {
    // Фарнсуорт не нужен.
    charGap = 3 * dit;
    wordGap = 7 * dit;
  } else {
    // Растяжка пауз по Фарнсуорту.
    const ta = (60 * C - 37.2 * E) / (C * E); // доп. время на стандартное слово, сек
    const fUnit = ta / 19;
    charGap = 3 * fUnit;
    wordGap = 7 * fUnit;
  }
  return { dit, dah, intraGap, charGap, wordGap };
}

// Превратить код ('.-..') в расписание сегментов для ОДНОГО знака.
// Возвращает массив { tone: boolean, dur, kind } — без завершающей паузы знака.
// kind: 'dit' | 'dah' | 'intra' — для визуальной вспышки в ритме (§11).
export function codeToSchedule(code, charWpm, effWpm) {
  const t = charTiming(charWpm, effWpm);
  const seq = [];
  const elems = code.split('');
  for (let i = 0; i < elems.length; i++) {
    const el = elems[i];
    if (el === '.') seq.push({ tone: true, dur: t.dit, kind: 'dit' });
    else if (el === '-') seq.push({ tone: true, dur: t.dah, kind: 'dah' });
    if (i < elems.length - 1) seq.push({ tone: false, dur: t.intraGap, kind: 'intra' });
  }
  return seq;
}

// Суммарная длительность проигрывания одного знака (без паузы после), сек.
export function codeDuration(code, charWpm, effWpm) {
  return codeToSchedule(code, charWpm, effWpm).reduce((s, x) => s + x.dur, 0);
}

// ——— Режим «Ключ» (ТЗ §7.3). Все пороги — от keyDit. ———
export function keyDitSeconds(keyWpm) {
  return 1.2 / keyWpm;
}

// Пороги распознавания в режиме «Ключ» (секунды).
export function keyThresholds(keyWpm) {
  const keyDit = keyDitSeconds(keyWpm);
  return {
    keyDit,
    elementMax: 2 * keyDit, // удержание <= этого → точка, больше → тире
    charGapMin: 3 * keyDit, // пауза >= этого → конец знака
    wordGapMin: 7 * keyDit, // пауза >= этого → конец слова
    debounceMin: 0.3 * keyDit, // фильтр сверхкоротких касаний/дребезга (§13.7)
  };
}

// Классифицировать удержание в точку/тире.
export function classifyHold(holdSeconds, keyWpm) {
  const { elementMax } = keyThresholds(keyWpm);
  // Крошечный допуск: удержание ровно 2*keyDit должно быть точкой (ТЗ: «<= 2*keyDit»),
  // иначе ошибка float делает 200 мс «тире».
  return holdSeconds <= elementMax + 1e-9 ? '.' : '-';
}

// Классифицировать паузу после отпускания: 'intra' | 'char' | 'word'.
export function classifyGap(gapSeconds, keyWpm) {
  const { charGapMin, wordGapMin } = keyThresholds(keyWpm);
  if (gapSeconds >= wordGapMin) return 'word';
  if (gapSeconds >= charGapMin) return 'char';
  return 'intra';
}
