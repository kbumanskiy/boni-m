// снято с 9cb57cd (app/js/timing.js, выпуск morse-v27), не править — сверяется по SHA-256 в test/rollback.test.js
// Тайминг Морзе — стандарт PARIS + растяжка Фарнсуорта (ТЗ §5).
// Все формулы реализованы ровно как в ТЗ. Менять нельзя без сверки.

// Базовые соотношения: тире = 3 точки (по умолчанию; в учёбе — регулятор «Длина тире»,
// в радиограмме всегда 3); пауза между элементами = 1 точка;
// между знаками = 3 точки; между словами = 7 точек.

export const DEFAULTS = {
  charWpm: 18, // C — скорость самих знаков (Кох)
  effWpm: 9,   // E — эффективная скорость (Фарнсуорт), всегда E <= C
  keyWpm: 12,  // отдельная медленная скорость для режима «Ключ»
};

// ——— Пределы настроек: ОДИН источник правды ———
// Раньше границы жили в двух местах: экран настроек предлагал свой диапазон, а миграция
// состояния (state.js) зажимала своим — более узким. Из-за этого выставленные 150 зн/мин
// доживали только до перезапуска приложения, а потом тихо возвращались к 110. Снаружи это
// выглядит ровно как жалоба с форума «скорость не регулируется», только хуже: сначала
// регулируется, а назавтра нет. Теперь границы объявлены здесь и читаются обоими.
//
// Верх скорости знака — 45 WPM (225 зн/мин): просьба с форума QRZ.RU, «на 30 скучно».
// Точка на 45 WPM длится 27 мс, фронты огибающей по 5 мс — звук остаётся чистым.
export const LIMITS = {
  charWpm: { min: 8, max: 45 },
  // Нижняя граница пауз — 3: при скорости знака 8 ступени «втрое» и «вчетверо» иначе
  // упирались в предел, и ползунок двигался вхолостую.
  effWpm:  { min: 3, max: 45 },   // сверху всё равно зажимается скоростью знака (E <= C)
  keyWpm:  { min: 5, max: 25 },
  toneHz:  { min: 400, max: 1000 },
  volume:  { min: 0.15, max: 1 },
  // Контрольная радиограмма считается прямо в знаках в минуту (так в правилах
  // радиоспорта), поэтому и границы здесь в них же, а не в WPM.
  radiogramCpm: { min: 40, max: 225 },  // ниже 0,15 морзянку уже не слышно — глушить нечем, есть кнопка выхода
  // «Длинная» радиограмма — тренировка с числом групп на выбор (не по правилам).
  // Не диапазон, а список: читают его экран и миграция (белый список, без зажима).
  // Уменьшить список — запасной путь, если на старом телефоне длинная очередь звука заикается.
  radiogramGroups: { options: [20, 30, 50], def: 30 },
  // Длина тире в точках (ТЗ-длина-тире.md). Ступени — для ползунка и белого списка миграции,
  // min/max — для проверки параметра в charTiming. Радиограмма всегда 3.
  dahRatio: { min: 3, max: 4, steps: [3, 3.5, 4], def: 3 },
};

// §5/§13: интерфейс физически не даёт выставить E > C.
export function clampEff(effWpm, charWpm) {
  return Math.min(effWpm, charWpm);
}

// «Медленнее» («Учиться», Радиоигра): паузы на 3 WPM длиннее, но не ниже нижней границы
// настроек и НИКОГДА не быстрее обычного. Раньше стоял пол 5 WPM, а настройки пускают
// до 3 — и на самой медленной скорости «Медленнее» играло быстрее.
export function slowerEff(effWpm, charWpm) {
  const e = clampEff(effWpm, charWpm);
  return Math.min(e, Math.max(LIMITS.effWpm.min, e - 3));
}

// ——— Шкала скорости ———
// Радисты считают скорость в ЗНАКАХ В МИНУТУ, а международная привычка — в словах
// в минуту (WPM). Пересчёт стандартный, по эталонному слову PARIS: в нём пять знаков,
// значит знаков в минуту ровно впятеро больше. 30 WPM = 150 зн/мин — та самая цифра,
// которую просили на форуме QRZ.RU.
export function cpm(wpm) {
  return Math.round(wpm * 5);
}

// Длительность точки (сек) на скорости знаков C.
export function ditSeconds(charWpm) {
  return 1.2 / charWpm;
}

// Полный набор длительностей (в секундах) для C и E.
// dahRatio — длина тире в точках (регулятор «Длина тире»). Меняет ТОЛЬКО тире: точка
// и все паузы, включая растяжку Фарнсуорта, остаются прежними — компенсации нет
// намеренно (ТЗ-длина-тире.md, 2.3). Не число или вне LIMITS.dahRatio — считаем 3.
export function charTiming(charWpm, effWpm, dahRatio = 3) {
  const C = charWpm;
  const E = clampEff(effWpm, charWpm);
  const dit = 1.2 / C;
  const lo = LIMITS.dahRatio?.min ?? 3, hi = LIMITS.dahRatio?.max ?? 3;
  const r = typeof dahRatio === 'number' && isFinite(dahRatio)
    && dahRatio >= lo && dahRatio <= hi ? dahRatio : 3;
  const dah = r * dit;
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
export function codeToSchedule(code, charWpm, effWpm, dahRatio = 3) {
  const t = charTiming(charWpm, effWpm, dahRatio);
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
export function codeDuration(code, charWpm, effWpm, dahRatio = 3) {
  return codeToSchedule(code, charWpm, effWpm, dahRatio).reduce((s, x) => s + x.dur, 0);
}

// ——— Режим «Ключ» (ТЗ §7.3). Все пороги — от keyDit. ———
export function keyDitSeconds(keyWpm) {
  return 1.2 / keyWpm;
}

// Нижние пределы пауз — под реальную руку 73 лет, а не под учебник.
// По формуле ТЗ пауза конца знака на скорости 12 равна 0,3 с: спокойные три касания
// внутри одной буквы не укладываются, и «С» распадается на «Е Е Е». Скорость передачи
// (длина точки и тире) остаётся ровно по стандарту — растянуты только ПАУЗЫ, то есть
// человеку дают договорить знак. Тот же приём уже применён к авто-пробелу.
const CHAR_GAP_FLOOR = 0.6;   // сек — столько ждём конца знака на спокойной скорости (12)
const FLOOR_AT_WPM = 12;      // скорость, для которой этот запас и считался
const WORD_GAP_MARGIN = 0.5;  // сек — насколько пауза слова длиннее паузы знака

// Пороги распознавания в режиме «Ключ» (секунды).
//
// Запас на паузу конца знака убывает с ростом скорости. Он появился ради спокойной руки:
// по формуле на скорости 12 конец знака наступает через 0,3 с, и три неторопливых касания
// внутри буквы не укладывались — «С» распадалась на «Е Е Е». Но постоянные 0,6 с при 25 WPM
// означали бы, что быстрый радист обязан ждать после каждой буквы вчетверо дольше нормы,
// а его буквы всё равно слипались бы в одну. Поэтому запас тает: 0,6 с на 12 WPM,
// около 0,29 с на 25. Быстрее нормы порог всё равно не станет — 3 точки остаются полом.
export function keyThresholds(keyWpm) {
  const keyDit = keyDitSeconds(keyWpm);
  const floor = CHAR_GAP_FLOOR * Math.min(1, FLOOR_AT_WPM / Math.max(1, keyWpm));
  const charGapMin = Math.max(floor, 3 * keyDit);
  return {
    keyDit,
    elementMax: 2 * keyDit, // удержание <= этого → точка, больше → тире
    charGapMin,             // пауза >= этого → конец знака
    wordGapMin: Math.max(charGapMin + WORD_GAP_MARGIN, 7 * keyDit), // пауза >= этого → конец слова
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

// ——— План передачи (контрольная радиограмма) ———
// Когда начинается каждый звучащий знак и сколько длится вся передача. Цикл ПОВТОРЯЕТ цикл
// playSequence в audio.js: расписание знака, пауза знака после каждого, пауза слова на
// пробеле, неизвестный знак пропускается. Совпадение держит тест на поддельном аудиоконтексте.
// Начальная задержка playSequence (0,1 с) сюда НЕ входит: отсчёт от начала первого знака,
// а total — момент onDone(true) минус эта задержка.
export function sequenceTimeline(chars, codeOf, charWpm, effWpm) {
  const tmg = charTiming(charWpm, effWpm);
  const starts = [];
  let t = 0;
  for (const ch of chars) {
    if (ch === ' ') { t += tmg.wordGap; continue; }
    const code = codeOf(ch);
    if (!code) continue;
    starts.push(t);
    t += codeDuration(code, charWpm, effWpm) + tmg.charGap;
  }
  return { starts, total: t };
}

// Оценка длительности длинной радиограммы для подсказки на экране подготовки: средняя
// длительность знака ПО ВЫБРАННОМУ НАБОРУ (цифры почти вдвое длиннее букв) × число знаков
// плюс паузы между группами. Округление до полуминуты — дело экрана.
export function estimateRadiogramSeconds(set, codeOf, groups, wpm, groupSize = 5) {
  const codes = [...set].map((ch) => codeOf(ch)).filter(Boolean);
  if (!codes.length || !(groups > 0)) return 0;
  const tmg = charTiming(wpm, wpm);
  const avg = codes.reduce((s, c) => s + codeDuration(c, wpm, wpm) + tmg.charGap, 0) / codes.length;
  return avg * groups * groupSize + (groups - 1) * tmg.wordGap;
}
