// Отказ записи (verify) — см. move-fail-case.mjs
process.env.MOVE_FAIL = 'verify';
await import('./move-fail-case.mjs');
