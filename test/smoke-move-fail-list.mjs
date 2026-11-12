// Отказ записи (list) — см. move-fail-case.mjs
process.env.MOVE_FAIL = 'list';
await import('./move-fail-case.mjs');
