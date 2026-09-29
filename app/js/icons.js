// Иконки одной линией, в стиле нижнего меню: обводка 2px, круглые концы, сетка 24×24.
// Раньше в интерфейсе стояли эмодзи (🔁 🔊 💾 📂 🐢 🐇) — они рисуются шрифтом системы,
// поэтому выглядят чужеродно, а местами не отрисовываются вовсе. Свои иконки предсказуемы
// и наследуют цвет текста, поэтому одинаково работают в обеих темах.

const svg = (body, size = 24) =>
  `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  // Послушать заново
  replay: (s) => svg('<path d="M20 12a8 8 0 1 1-2.8-6.1"/><path d="M20 4v5h-5"/>', s),
  // Звук / образец
  sound: (s) => svg('<path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4z"/><path d="M16.2 9a4.2 4.2 0 0 1 0 6"/><path d="M19 6.2a8 8 0 0 1 0 11.6"/>', s),
  // Стереть последний знак
  erase: (s) => svg('<path d="M9 5.5h9.5A1.5 1.5 0 0 1 20 7v10a1.5 1.5 0 0 1-1.5 1.5H9L3.5 12z"/><path d="M15.5 9.5l-4.5 5M11 9.5l4.5 5"/>', s),
  // Очистить всё
  clear: (s) => svg('<path d="M4.5 7.5h15"/><path d="M9.5 7.5V5.5h5v2"/><path d="M6.5 7.5 7.5 19a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-11.5"/>', s),
  // Сохранить копию (стрелка вниз в лоток)
  save: (s) => svg('<path d="M12 4v9"/><path d="M8.5 9.5 12 13l3.5-3.5"/><path d="M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15"/>', s),
  // Восстановить из копии (стрелка вверх из лотка)
  restore: (s) => svg('<path d="M12 13V4"/><path d="M8.5 7.5 12 4l3.5 3.5"/><path d="M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15"/>', s),
  // Принять радиограмму
  inbox: (s) => svg('<path d="M12 13.5V19"/><circle cx="12" cy="20.5" r="1.2" fill="currentColor" stroke="none"/><path d="M8.5 10a5 5 0 0 1 7 0"/><path d="M5.5 6.8a9.5 9.5 0 0 1 13 0"/>', s),
  // Верно
  check: (s) => svg('<path d="M5 12.5 9.5 17 19 7.5"/>', s),
  // Выход из занятия
  exit: (s) => svg('<path d="M14.5 5.5H18a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-3.5"/><path d="M11 8.5 7.5 12l3.5 3.5"/><path d="M7.5 12h7"/>', s),
  // Настройки: шестерёнка. Первая версия рисовалась кружком и восемью прямыми лучами —
  // и это оказалось солнышком: с форума написали «подумал, что это выбор светлой/тёмной
  // темы». Луч от центра и зубец шестерёнки — разные вещи, а рядом в том же приложении
  // есть настоящее солнце (светлая тема). Теперь это замкнутый контур с восемью
  // прямоугольными зубцами: ни с чем не спутать даже в 22 пикселя.
  gear: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M10.4 2.9h3.2l.35 2.2 1.9.8 1.8-1.3 2.25 2.25-1.3 1.8.8 1.9 2.2.35v3.2l-2.2.35-.8 1.9 1.3 1.8-2.25 2.25-1.8-1.3-1.9.8-.35 2.2h-3.2l-.35-2.2-1.9-.8-1.8 1.3L3.4 18.15l1.3-1.8-.8-1.9-2.2-.35v-3.2l2.2-.35.8-1.9-1.3-1.8L5.65 4.6l1.8 1.3 1.9-.8z"/>', s),
  // Подсказка
  help: (s) => svg('<circle cx="12" cy="12" r="8.2"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .9-1 1.6v.3"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>', s),
  // Поддержать проект
  heart: (s) => svg('<path d="M12 20s-7.2-4.5-7.2-9.4A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.2 2.4C19.2 15.5 12 20 12 20z"/>', s),
  // Отправить письмо
  send: (s) => svg('<path d="M20 4 3.5 10.6a.5.5 0 0 0 .05.94L10 13.2l1.7 6.3a.5.5 0 0 0 .93.1L20 4z"/><path d="M20 4l-9.6 9.4"/>', s),
  // Тема: как в телефоне / светлая / тёмная
  auto: (s) => svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/>', s),
  sun: (s) => svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>', s),
  moon: (s) => svg('<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>', s),
  // Медленнее / быстрее — концы регулятора скорости
  slow: (s) => svg('<path d="M9 8.5v7M15 8.5v7"/>', s),
  fast: (s) => svg('<path d="M6 8.5v7M12 8.5v7M18 8.5v7"/>', s),
  // Радиоигра: «Слушать» (впервые) и «Дальше» / стрелка плитки
  play: (s) => svg('<path d="M8 5.5v13l10.5-6.5z"/>', s),
  next: (s) => svg('<path d="M9.5 5.5 16 12l-6.5 6.5"/>', s),
  // Плитка «Радиоигра»: облачко реплики с точкой и тире
  bubble: (s) => svg('<path d="M4.5 4.5h15A1.5 1.5 0 0 1 21 6v9.5a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V17h-2A1.5 1.5 0 0 1 3 15.5V6a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="8" cy="10.75" r="1.4" fill="currentColor" stroke="none"/><path d="M11.5 10.75h5"/>', s),
};

// Картинки для ответов Радиоигры, категория «Слово» (перенесены из прототипа).
// Своя сетка 48×48 и линия 2.6: предмет рисуется крупно, 72–104px. Цвет — из текста,
// одинаково в обеих темах; эмодзи не годятся (на старых Android пустые квадратики).
// Ключ — название предмета ровно как в каталоге puzzle.js (right / wrong).
export const PIC = {
  'кот': '<path d="M16 14 15 5l6 4.5q3-.7 6 0L33 5l-1 9q1 8-8 9-9-1-8-9z"/><circle cx="20.5" cy="14.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="27.5" cy="14.5" r="1.3" fill="currentColor" stroke="none"/><path d="M23 18h2l-1 1.3z"/><path d="M10 17l6.5 1M10 21l6.5-1M38 17l-6.5 1M38 21l-6.5-1"/><path d="M18 22.5q-6 9-3.5 19.5h19q2.5-10.5-3.5-19.5"/><path d="M34 41q8 0 8-8 0-5-4-4"/><path d="M21 42v-5M27 42v-5"/>',
  'заяц': '<circle cx="18" cy="23" r="7"/><path d="M15.5 16.8Q12 5 15 3.5q3-1 4.8 13"/><path d="M20.5 16.5Q22 4 26 4.5q3 1-2 13.5"/><circle cx="20" cy="22" r="1.3" fill="currentColor" stroke="none"/><path d="M11.5 25.5l1.5.5"/><path d="M23 28q13-6 17 5 2 9-7 9H17q-2 0-1-3 1-3 5-3"/><circle cx="41.5" cy="32" r="2.5"/><path d="M25 42v-5"/>',
  'кит': '<path d="M5 27q0-13 15-13 14 0 18 11l6-7q2 8-2.5 12Q46 33 45 40l-7-7q-6 7-19 7Q5 40 5 27z"/><circle cx="12" cy="24" r="1.4" fill="currentColor" stroke="none"/><path d="M6 30q7 4 15 2"/><path d="M17 11V4M17 7q-3-3-6-2M17 7q3-3 6-2"/>',
  'дом': '<path d="M7 23 24 8l17 15"/><path d="M11 20v21h26V20"/><path d="M21 41V30h6v11"/><path d="M14 25h4v4h-4zM30 25h4v4h-4z"/><path d="M31 14V8h4v9.5"/>',
  'сыр': '<path d="M5 24 38 12l5 12z"/><path d="M5 24v13h38V24"/><circle cx="13" cy="30.5" r="2.2"/><circle cx="25" cy="31" r="2.8"/><circle cx="36" cy="29.5" r="1.7"/><ellipse cx="31" cy="19.5" rx="2" ry="1.2"/>',
  'лук': '<path d="M24 9q0 6 10 13 7 8 0 16-4 4-10 4t-10-4q-7-8 0-16 10-7 10-13z"/><path d="M24 12q-7 13-3 29M24 12q7 13 3 29"/><path d="M20 42l-2 3.5M24 42v4M28 42l2 3.5"/><path d="M24 9q-2-5-5-6M24 9q2-5 5-6"/>',
  'чашка чая': '<path d="M8 20h26v8q0 11-13 11T8 28z"/><path d="M34 22q7 0 7 5t-7 5"/><path d="M5 43q16 3 32 0"/><path d="M15 15q-2-3 0-5.5T15 4M21 15q-2-3 0-5.5T21 4M27 15q-2-3 0-5.5T27 4"/>',
  'лес': '<circle cx="11" cy="20" r="7"/><path d="M11 27v14"/><path d="M25 5l7 12h-4l6 11H16l6-11h-4z"/><path d="M25 28v13"/><circle cx="39" cy="24" r="5.5"/><path d="M39 29.5V41"/><path d="M3 41h42"/>',
  'жук': '<ellipse cx="24" cy="29" rx="10" ry="12"/><path d="M24 17v24"/><circle cx="24" cy="13" r="4.5"/><path d="M22 9q-3-5-7-4M26 9q3-5 7-4"/><path d="M14.5 23 8 19.5M14 29H6.5M15.5 35l-6 4M33.5 23l6.5-3.5M34 29h7.5M32.5 35l6 4"/><circle cx="19.5" cy="26" r="1.7" fill="currentColor" stroke="none"/><circle cx="28.5" cy="26" r="1.7" fill="currentColor" stroke="none"/><circle cx="20" cy="33" r="1.7" fill="currentColor" stroke="none"/><circle cx="28" cy="33" r="1.7" fill="currentColor" stroke="none"/>',
  'мяч': '<circle cx="24" cy="24" r="16"/><path d="M24 16.5l7.1 5.2-2.7 8.4h-8.8l-2.7-8.4z" fill="currentColor" stroke="none"/><path d="M29.2 8.9L29.3 12.7L33.1 15.5L36.8 14.4zM40.0 24.3L36.4 25.5L34.9 30.1L37.1 33.2zM28.7 39.3L26.4 36.3L21.6 36.3L19.3 39.3zM10.9 33.2L13.1 30.1L11.6 25.5L8.0 24.3zM11.2 14.4L14.9 15.5L18.7 12.7L18.8 8.9z" fill="currentColor" stroke="none"/><path d="M29.3 12.7L24.0 12.0L18.7 12.7M24.0 16.5L24.0 12.0M36.4 25.5L35.4 20.3L33.1 15.5M31.1 21.7L35.4 20.3M26.4 36.3L31.1 33.7L34.9 30.1M28.4 30.1L31.1 33.7M13.1 30.1L16.9 33.7L21.6 36.3M19.6 30.1L16.9 33.7M14.9 15.5L12.6 20.3L11.6 25.5M16.9 21.7L12.6 20.3" stroke-width="1.8"/>',
  'сова': '<path d="M12 17q0 25 12 25t12-25l-4-8-4 4q-4-1.5-8 0l-4-4z"/><circle cx="19" cy="21" r="4.5"/><circle cx="29" cy="21" r="4.5"/><circle cx="19" cy="21" r="1.6" fill="currentColor" stroke="none"/><circle cx="29" cy="21" r="1.6" fill="currentColor" stroke="none"/><path d="M22.5 26l1.5 3.5 1.5-3.5z"/><path d="M15 29q4 6 3 11M33 29q-4 6-3 11"/><path d="M6 44h36"/><path d="M20 42v2M28 42v2"/>',
  'утка': '<circle cx="15" cy="15" r="6.5"/><path d="M9 15.5 3 18l6.5 1.5"/><circle cx="16" cy="13.5" r="1.3" fill="currentColor" stroke="none"/><path d="M12 21q-7 5-4 11 3 6 16 6 14 0 18-9l2-7q-6 4-12 3-7-1-12-4"/><path d="M20 29q8 5 16-1"/><path d="M4 43q4-2 8 0t8 0 8 0 8 0 8 0"/>',
  'рыба': '<path d="M4 24q12-14 27 0-15 14-27 0z"/><path d="M31 24l12-9v18z"/><circle cx="11" cy="22.5" r="1.5" fill="currentColor" stroke="none"/><path d="M17 17.5q3 6.5 0 13"/><path d="M19 16.5q3-5 8-3.5"/>',
  'гриб': '<path d="M5 25Q5 8 24 8t19 17z"/><path d="M17 25q-3 10-1 17h16q2-7-1-17"/><path d="M4 42h40"/><path d="M13 16q3-3 6-3"/>',
  'зонт': '<path d="M4 24Q6 7 24 7t20 17q-4-3-8 0-4-3-8 0-4-3-8 0-4-3-8 0-4-3-8 0z"/><path d="M24 24v14q0 5-4 5t-4-4"/><path d="M24 7V4"/>',
  'хлеб': '<path d="M6 32q0-16 18-16t18 16v4q0 2-2 2H8q-2 0-2-2z"/><path d="M14 22l4 6M22 20l4 7M30 21l4 6"/>',
  'слон': '<path d="M22 12h11q8 0 8 9v17h-5v-7H26v7h-5v-7"/><path d="M22 12q-12-1-12 10 0 5 2 8 1 6-4 10l3 2q6-4 5-11 2 1 5 1"/><path d="M19 15q8 0 8 7t-7 6"/><circle cx="14.5" cy="19" r="1.4" fill="currentColor" stroke="none"/><path d="M41 20q3 4 2 8"/>',
  'часы': '<circle cx="24" cy="26" r="14"/><path d="M24 26v-8M24 26l6 4"/><path d="M9.5 15A6 6 0 0 1 17 8.5zM38.5 15A6 6 0 0 0 31 8.5z"/><path d="M14 38l-3 4M34 38l3 4"/><path d="M24 14v2M36 26h-2M24 38v-2M12 26h2"/>',
  'ключ': '<circle cx="12" cy="24" r="7.5"/><circle cx="12" cy="24" r="2.5"/><path d="M19.5 24H43"/><path d="M37 24v6M42 24v5M32 24v4"/>',
  'ёлка': '<path d="M24 4l7 10h-4l7 10h-5l8 11H11l8-11h-5l7-10h-4z"/><path d="M21 35v8h6v-8"/>',
  'конь': '<path d="M14 43h24q2-17-4-29-4-7-12-6l-2-4-3 5q-5 4-8 11-2 4 1 6 3 1 6-2 2-2 6-2-4 8-8 21z"/><circle cx="22" cy="14" r="1.4" fill="currentColor" stroke="none"/><path d="M30 10q6 8 6 20"/><circle cx="11" cy="22" r=".8" fill="currentColor" stroke="none"/>',
  'окно': '<path d="M9 6h30v33H9z"/><path d="M24 6v33M9 22h30"/><path d="M5 42.5h38"/><path d="M9 39l-4 3.5M39 39l4 3.5"/>',
  'стул': '<path d="M14 22V6q0-2 2-2h16q2 0 2 2v16"/><path d="M14 12h20"/><path d="M10 22h28l-2 6H12z"/><path d="M13 28v15M35 28v15M18 28v10M30 28v10"/>',
  'луна': '<path d="M29 5A19 19 0 1 0 43 33 15 15 0 0 1 29 5z"/><circle cx="40" cy="9" r="1.6" fill="currentColor" stroke="none"/><circle cx="35" cy="20" r="1.2" fill="currentColor" stroke="none"/><circle cx="43" cy="17" r="1" fill="currentColor" stroke="none"/>',
  'лимон': '<path d="M7 26q1-12 16-13 15-1 18 11 0 12-17 13Q8 38 7 26z"/><path d="M7 26 3 27M41 24l4-1"/><path d="M34 13q3-7 10-7-2 7-10 7z"/><path d="M28 13.5q3-2 6-.5"/>',
  'лампа': '<path d="M8 43h18"/><path d="M17 43l-4-14 11-11"/><circle cx="13" cy="29" r="2" fill="currentColor" stroke="none"/><path d="M22 15l6-6 16 9-9 9z"/><path d="M37 31l1 4M43 28l3 2.5"/>',
  'лодка': '<path d="M4 31h40l-6 9H10z"/><path d="M24 31V5"/><path d="M24 7l12 21H24"/><path d="M24 11 14 27h10"/><path d="M4 44q4-2 8 0t8 0 8 0 8 0 8 0"/>',
  'поезд': '<path d="M8 20h20v14H8z"/><path d="M28 11h12v23H28z"/><path d="M31 15h6v6h-6z"/><path d="M12 20v-8h6v8"/><circle cx="16" cy="6.5" r="2.5"/><circle cx="14" cy="38" r="4"/><circle cx="26" cy="38" r="4"/><circle cx="36.5" cy="38" r="4"/><path d="M8 34l-4 6"/>',
  'груша': '<path d="M24 12q-4 0-4 6 0 4-4 9-5 7-1 12 4 4 9 4t9-4q4-5-1-12-4-5-4-9 0-6-4-6z"/><path d="M24 12q0-4 2-7"/><path d="M25.5 8.5q5.5-4 9.5-1-5 4-9.5 1z"/>',
  'шапка': '<path d="M10 34q0-20 14-20t14 20"/><rect x="7" y="34" width="34" height="8" rx="3"/><circle cx="24" cy="9.5" r="4.5"/><path d="M17 18v16M24 15v19M31 18v16"/>',
  'радиоприёмник': '<rect x="5" y="16" width="38" height="25" rx="4"/><path d="M30 16l8-12"/><circle cx="17" cy="28.5" r="7"/><path d="M12 26h10M11 29h12M12 32h10"/><path d="M29 22h10"/><path d="M33 20v4"/><circle cx="30" cy="33" r="2"/><circle cx="38" cy="33" r="2"/>',
};

export const picSVG = (name, size = 72) => (PIC[name]
  ? `<svg class="icon pic" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor"
     stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PIC[name]}</svg>`
  : '');
