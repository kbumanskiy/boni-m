// Service worker: полнота списка офлайн-кэша.
// Забыть новый файл в этом списке — самая дорогая ошибка проекта: приложение обещает
// работать без интернета, а импорт незакэшированного модуля роняет ВСЁ приложение
// в пустой экран. Проверять глазами бесполезно — файлы добавляются по одному.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = new URL('../app/', import.meta.url).pathname;
const sw = readFileSync(join(APP, 'sw.js'), 'utf8');

// Пути, перечисленные в списке предзагрузки.
const listed = new Set(
  [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter((p) => p !== '')
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(APP, full));
  }
  return out;
}

const all = walk(APP);
// sw.js себя не кэширует — браузер обновляет его отдельно.
const mustCache = all.filter((f) => f !== 'sw.js' && /\.(js|css|html|webmanifest|webp|png)$/.test(f));

test('все файлы приложения перечислены в офлайн-кэше', () => {
  const missing = mustCache.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [],
    `не попадут в офлайн-кэш: ${missing.join(', ')} — без интернета приложение не откроется`);
});

test('в списке кэша нет несуществующих файлов', () => {
  const ghosts = [...listed].filter((f) => f && f !== './' && !all.includes(f));
  assert.deepEqual(ghosts, [],
    `перечислены, но не существуют: ${ghosts.join(', ')} — установка кэша упадёт целиком`);
});

test('каждый модуль, который импортирует приложение, есть в кэше', () => {
  const missing = [];
  for (const file of all.filter((f) => f.endsWith('.js') && f !== 'sw.js')) {
    const src = readFileSync(join(APP, file), 'utf8');
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      const resolved = join(dir, m[1]).replace(/\\/g, '/');
      if (!listed.has(resolved)) missing.push(`${file} → ${resolved}`);
    }
  }
  assert.deepEqual(missing, [], `импортируется, но не кэшируется: ${missing.join('; ')}`);
});

test('версия кэша поднята относительно прошлого выпуска', () => {
  // Без смены имени кэша старая оболочка живёт на телефоне вечно, и обновление не приедет.
  const m = /const CACHE = 'morse-v(\d+)'/.exec(sw);
  assert.ok(m, 'в sw.js нет версионированного имени кэша');
  assert.ok(Number(m[1]) >= 5, `версия кэша morse-v${m[1]} — при выпуске её нужно поднимать`);
});

test('установка качает файлы мимо HTTP-кэша браузера (cache: \'reload\')', () => {
  // Pages отдаёт файлы с max-age до 10 минут. Без reload новый кэш мог собраться из смеси
  // новых и старых файлов — новый app.js со старым state.js ронял главную.
  const install = /addEventListener\('install'[\s\S]*?\n\}\);/.exec(sw);
  assert.ok(install, 'в sw.js нет обработчика install');
  assert.match(install[0], /new Request\(\s*u\s*,\s*\{\s*cache:\s*'reload'\s*\}\s*\)/,
    'install должен качать каждый файл через new Request(u, { cache: \'reload\' })');
  assert.match(install[0], /ASSETS\.map\(/, 'reload должен применяться ко всему списку ASSETS');
});
