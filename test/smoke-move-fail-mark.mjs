// Отказ записи (mark) — см. move-fail-case.mjs
process.env.MOVE_FAIL = 'mark';
await import('./move-fail-case.mjs');
