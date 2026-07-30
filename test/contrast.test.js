// Контраст цветов — требование доступности (ТЗ §11), а не вкусовщина: папе 73 года.
// Тест читает НАСТОЯЩИЙ style.css, поэтому любая будущая правка палитры, которая ухудшит
// читаемость, роняет сборку, а не тихо доезжает до телефона.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/style.css', import.meta.url), 'utf8');

// Токены темы берём из блоков ручной перебивки — они содержат полный набор значений.
function themeTokens(selector) {
  const start = css.indexOf(selector + '{');
  assert.ok(start >= 0, `в style.css нет блока ${selector}`);
  const block = css.slice(start, css.indexOf('}', start));
  const tokens = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) tokens[m[1]] = m[2];
  return tokens;
}

const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (h) => {
  const [r, g, b] = srgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// [что, на чём, минимум]. 4.5 — текст (WCAG AA), 3.0 — значимая графика (шкала, след сигнала).
const PAIRS = [
  ['text', 'bg', 4.5, 'основной текст на фоне'],
  ['text', 'surface', 4.5, 'основной текст на карточке'],
  ['text-dim', 'bg', 4.5, 'приглушённый текст на фоне'],
  ['text-dim', 'surface', 4.5, 'приглушённый текст на карточке'],
  ['text-dim', 'surface-2', 4.5, 'приглушённый текст в нижнем меню'],
  ['accent-text', 'bg', 4.5, 'янтарный текст на фоне'],
  ['accent-text', 'surface', 4.5, 'янтарный текст на карточке'],
  ['accent-text', 'surface-2', 4.5, 'янтарный текст в нижнем меню'],
  ['on-accent', 'accent', 4.5, 'надпись на янтарной кнопке'],
  ['on-ok', 'ok', 4.5, 'надпись на кнопке «верно»'],
  ['on-bad', 'bad', 4.5, 'надпись на кнопке «неверно»'],
  ['accent', 'bg', 3.0, 'янтарная риска шкалы и след сигнала на фоне'],
  ['tick-off', 'bg', 3.0, 'пустая риска шкалы на фоне'],
];

for (const [selector, label] of [['\n:root[data-theme="light"]', 'светлая'], ['\n:root[data-theme="dark"]', 'тёмная']]) {
  test(`${label} тема: контраст всех сочетаний в норме`, () => {
    const t = themeTokens(selector.trim());
    for (const [fg, bg, min, what] of PAIRS) {
      assert.ok(t[fg], `в ${label} теме нет токена --${fg}`);
      assert.ok(t[bg], `в ${label} теме нет токена --${bg}`);
      const r = contrast(t[fg], t[bg]);
      assert.ok(r >= min, `${what}: ${r.toFixed(2)}:1, нужно ≥${min} (--${fg} на --${bg})`);
    }
  });
}

test('обе темы описаны одним и тем же набором токенов', () => {
  const light = Object.keys(themeTokens(':root[data-theme="light"]')).sort();
  const dark = Object.keys(themeTokens(':root[data-theme="dark"]')).sort();
  assert.deepEqual(light, dark, 'набор цветовых токенов у тем разошёлся — какой-то экран выпадет из темы');
});

test('автоматическая тёмная тема совпадает с ручной', () => {
  // Иначе телефон в тёмном режиме покажет одно, а кнопка «Тёмная» — другое.
  const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  const auto = {};
  for (const m of media.slice(0, media.indexOf('\n}')).matchAll(/--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) auto[m[1]] = m[2];
  const manual = themeTokens(':root[data-theme="dark"]');
  for (const [k, v] of Object.entries(manual)) {
    assert.equal(auto[k], v, `токен --${k} различается: автоматически ${auto[k]}, вручную ${v}`);
  }
});
