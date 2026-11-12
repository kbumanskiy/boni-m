// Отказ записи (save) — см. move-fail-case.mjs
process.env.MOVE_FAIL = 'save';
await import('./move-fail-case.mjs');
