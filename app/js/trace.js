// «След сигнала» — ритм кода, разложенный на полоски и паузы в стандартных пропорциях
// морзянки: точка = 1 единица, тире = 3, пауза внутри знака = 1, пауза между знаками = 3.
// Именно на этих пропорциях держится приём на слух, поэтому рисуем их честно, а не «красиво».
// Модуль чистый: возвращает список частей, ничего не знает про DOM.

// Части: 'dit' | 'dah' — звук; 'g1' | 'g3' — паузы (пустое место той же длины).
export function traceParts(code) {
  const out = [];
  for (const c of String(code)) {
    if (c !== '.' && c !== '-') continue; // мусор игнорируем, а не рисуем
    if (out.length) out.push('g1');
    out.push(c === '.' ? 'dit' : 'dah');
  }
  return out;
}

// Несколько знаков подряд (позывной, слово) — между знаками пауза в 3 единицы.
export function traceSequence(codes) {
  const out = [];
  for (const code of codes) {
    const parts = traceParts(code);
    if (!parts.length) continue;
    if (out.length) out.push('g3');
    out.push(...parts);
  }
  return out;
}

// Длина следа в единицах — нужна, чтобы подобрать масштаб под ширину экрана.
export function traceUnits(parts) {
  return parts.reduce((n, p) => n + (p === 'dah' || p === 'g3' ? 3 : 1), 0);
}
