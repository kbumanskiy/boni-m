// Запускатель сценариев переезда: каждый — отдельным процессом (app.js держит состояние в модуле,
// сливать сценарии в один процесс нельзя). ТЗ-переезд.md, 7.2, 7.4.
// Под `node --test` каждый файл smoke-move-*.mjs и так запускается отдельно — второй раз не нужно.
if (process.env.NODE_TEST_CONTEXT) process.exit(0);
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const dir = new URL('.', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => /^smoke-move-.+\.mjs$/.test(f) && f !== 'smoke-move-all.mjs').sort();
let total = 0, bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [`${dir}${f}`], { encoding: 'utf8' });
  const m = /: (\d+) проверок/.exec(r.stdout || '');
  const n = m ? +m[1] : 0;
  total += n;
  if (r.status !== 0) { bad++; console.log(`✗ ${f}\n${(r.stdout || '').split('\n').slice(-6).join('\n')}\n${(r.stderr || '').slice(0, 1500)}`); }
  else console.log(`✓ ${f}: ${n} проверок`);
}
console.log(`\nСценариев переезда: ${files.length}, проверок ${total}, упавших ${bad}`);
process.exit(bad ? 1 : 0);
