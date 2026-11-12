// Код и ссылка переноса из файла копии — тем же encodeTransfer, что в приложении (ТЗ-переезд.md, 6.7).
// Зачем: приёмка до того, как кнопку увидит кто-то, кроме Кости; и поддержка — человек прислал
// файл копии, Костя отвечает ссылкой, и перенос в одно касание.
// Печатает в терминал, никуда ничего не отправляет.
//   node tools/move-link.mjs <файл-копии.json> [--date ГГГГММДД] [--plain]
import { readFileSync } from 'node:fs';
import { readIncoming, exportText } from '../app/js/state.js';
import { encodeTransfer, linkFor, LINK_MAX } from '../app/js/move.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--date');
const di = args.indexOf('--date');
const date = di >= 0 ? args[di + 1] : undefined;
if (!file) { console.error('Использование: node tools/move-link.mjs <файл-копии.json> [--date ГГГГММДД] [--plain]'); process.exit(2); }

const text = readFileSync(file, 'utf8');
const rd = readIncoming(text);
if (!rd.ok) { console.error(`Это не файл копии «Школы Морзе 73» (${rd.reason}). Ничего не сделано.`); process.exit(1); }
const code = await encodeTransfer(exportText(JSON.parse(text)), {
  date, ...(args.includes('--plain') ? { CompressionStream: undefined } : {}),
});
console.log('Код переноса:\n' + code + '\n');
const link = linkFor(code);
console.log((link.length <= LINK_MAX ? 'Ссылка:\n' : 'Ссылка длиннее предела, отправьте код:\n') + link);
