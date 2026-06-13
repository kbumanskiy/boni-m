// Свободный набор на «Ключе»: строка из распознанных букв.
// Правило (решение Кости): между символами возможен МАКСИМУМ один пробел —
// после поставленного пробела второй не добавляется, пока не набрана новая буква.
// Чистые функции (без DOM) — тестируются отдельно от интерфейса.

export function emptyLine() {
  return { text: '', spaced: true }; // spaced=true → ведущего пробела не будет
}

// Добавить распознанную букву. После буквы снова разрешён один пробел.
export function addChar(line, ch) {
  return { text: line.text + ch, spaced: false };
}

// Поставить пробел — только если он ещё не стоит (один максимум) и строка не пуста.
export function addSpace(line) {
  if (line.spaced || !line.text || line.text.endsWith(' ')) return line;
  return { text: line.text + ' ', spaced: true };
}

// Стереть последний знак (букву или пробел).
export function eraseLast(line) {
  const text = line.text.slice(0, -1);
  return { text, spaced: text === '' || text.endsWith(' ') };
}

// Очистить всю строку.
export function clearLine() {
  return emptyLine();
}
