// Перенос прогресса (ТЗ-переезд.md, 7.1): формат строки, разбор вставки, порча, пределы,
// один путь приёма, страховочный список прежних версий, ужесточение migrate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as S from '../app/js/state.js';
import * as M from '../app/js/move.js';
import * as P from '../app/js/progress.js';
import * as G from '../app/js/gamify.js';
import * as DATA from '../app/js/data.js';
import * as PZ from '../app/js/puzzle.js';
import * as V27 from '../fixtures/v27/state.js';
import { v25State } from './fixtures-state.mjs';

const { migrate, defaultState, readIncoming, exportText } = S;

// ——— Три состояния из ТЗ 7.1.1 ———
function maxState() {
  const perChar = (alphabet) => Object.fromEntries(alphabet.map((c, i) => [c, { correct: 20 + (i % 7), total: 30 + (i % 9) }]));
  const puzzle = PZ.puzzleFresh();
  for (const cat of PZ.CAT_IDS) puzzle[cat].solved = PZ.idsOf(cat);
  puzzle.isNew = false;
  return migrate({
    profile: { name: 'Бонислав Ёжиков', callsign: 'Boney M', points: 99999 },
    progress: {
      ru: { learnedCount: 32, digitsLearned: 10, perChar: perChar([...DATA.KOCH_ORDER_RU, ...DATA.DIGIT_ORDER]),
            recent: Array.from({ length: 30 }, (_, i) => i % 3 === 0 ? 0 : 1), parked: [{ char: 'Ь', returnAt: 36 }], lastFirst: 'Щ' },
      en: { learnedCount: 26, digitsLearned: 10, perChar: perChar([...DATA.KOCH_ORDER_EN, ...DATA.DIGIT_ORDER]),
            recent: Array.from({ length: 30 }, () => 1), parked: [{ char: 'Q', returnAt: 30 }], lastFirst: 'X' },
    },
    settings: { alphabet: 'en', charWpm: 25, effWpm: 25, keyWpm: 20, toneHz: 700, volume: 0.8, showChants: false,
      radiogramCpm: 200, radiogramKind: 'mixed', radiogramLong: true, radiogramGroups: 50, knowsAll: true, dahRatio: 4, theme: 'dark' },
    streak: { current: 400, longest: 400, lastActiveDate: '2026-10-17' },
    records: { radiogramCpm: 190 },
    totalSeconds: 3600 * 500,
    history: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, answers: 100 + i, accuracyPct: 90 })),
    milestones: Object.fromEntries(Object.keys(G.MILESTONES).map((k) => [k, true])),
    puzzle,
  });
}
const STATES = { 'пустое': defaultState(), 'снимок v25': migrate(v25State('2026-10-17')), 'максимум': maxState() };
const MODES = { z: {}, j: { CompressionStream: undefined } };
const CODE_Z = async (s) => M.encodeTransfer(exportText(s), { date: '20261018' });

test('1. туда и обратно: три состояния × z и j', async () => {
  for (const [name, s] of Object.entries(STATES)) {
    for (const [mode, opts] of Object.entries(MODES)) {
      const code = await M.encodeTransfer(exportText(s), { ...opts, date: '20261018' });
      assert.match(code, new RegExp(`^M73\\.1\\.${mode}\\.20261018\\.[0-9a-f]{8}\\.[A-Za-z0-9_-]+\\.$`), `${name}/${mode}: вид строки`);
      const dec = await M.decodeTransfer(code);
      assert.equal(dec.ok, true, `${name}/${mode}`);
      assert.equal(dec.date, '2026-10-18');
      const rd = readIncoming(dec.json);
      assert.equal(rd.ok, true);
      assert.deepEqual(rd.state, migrate(s), `${name}/${mode}: состояние`);
    }
  }
  const s = migrate({ profile: { name: 'Ёжик Щука' }, progress: { ru: { perChar: { 'Щ': { correct: 1, total: 2 } } } } });
  const back = readIncoming((await M.decodeTransfer(await CODE_Z(s))).json).state;
  assert.equal(back.profile.name, 'Ёжик Щука');
  assert.deepEqual(back.progress.ru.perChar['Щ'], { correct: 1, total: 2 });
});

test('2. тот же путь, что у копии из файла', async () => {
  for (const s of Object.values(STATES)) {
    const viaCode = readIncoming((await M.decodeTransfer(await CODE_Z(s))).json);
    const viaFile = readIncoming(exportText(s));
    assert.deepEqual(viaCode, viaFile);
  }
});

test('3. вставка как попало', async () => {
  const s = STATES['снимок v25'];
  const code = await CODE_Z(s);
  const want = migrate(s);
  const check = async (text, label) => {
    const d = await M.decodeTransfer(text);
    assert.equal(d.ok, true, label);
    assert.deepEqual(readIncoming(d.json).state, want, label);
  };
  await check(code.replace(/(.{60})/g, '$1\n'), 'переносы каждые 60 знаков');
  await check(code.replace(/(.{40})/g, '$1 '), 'неразрывные пробелы');
  await check(code.replace(/(.{30})/g, '$1\t \r\n'), 'табуляции и пробелы');
  await check(`https://app.morse73.ru/#perenos=${code}`, 'целая ссылка');
  await check(`Вот мой код: ${code} Спасибо!`, 'код внутри фразы');
  await check(`  \n ${code}\n\n`, 'пробелы вокруг');
  await check(code.slice(0, -1), 'без завершающей точки');
  await check(`https://app.morse73.ru/#perenos=${code.slice(0, -1)}`, 'ссылка без завершающей точки');
  // Два кода подряд — берётся первый.
  const other = await CODE_Z(STATES['максимум']);
  const d = await M.decodeTransfer(code + ' ' + other);
  assert.deepEqual(readIncoming(d.json).state, want, 'два кода: первый');
  assert.equal(M.extractCode(code + other), code);
});

test('4. порча: свой reason у каждого случая, исключений нет', async () => {
  const code = await CODE_Z(STATES['снимок v25']);
  const parts = code.split('.');
  const flip = (i) => { const d = parts[5]; const ch = d[i] === 'A' ? 'B' : 'A'; return [...parts.slice(0, 5), d.slice(0, i) + ch + d.slice(i + 1), ''].join('.'); };
  const cases = [
    ['заменён знак в данных (j)', async () => { const c = await M.encodeTransfer(exportText(STATES['снимок v25']), { ...MODES.j, date: '20261018' }); const p = c.split('.'); const d = p[5]; p[5] = d.slice(0, 700) + (d[700] === 'A' ? 'B' : 'A') + d.slice(701); return p.join('.'); }, 'corrupt'],
    ['заменён знак в данных (z)', async () => flip(40), 'corrupt'],
    ['отрезан хвост', async () => code.slice(0, code.length - 80), 'corrupt'],
    ['не тот CRC', async () => [...parts.slice(0, 4), '00000000', ...parts.slice(5)].join('.'), 'corrupt'],
    ['M74', async () => code.replace('M73.', 'M74.'), 'not-code'],
    ['версия 2', async () => code.replace('M73.1.', 'M73.2.'), 'newer'],
    ['сжатие x', async () => code.replace('.z.', '.x.'), 'bad-mode'],
    ['дата 20261340', async () => code.replace('.20261018.', '.20261340.'), 'bad-date'],
    ['пустая строка', async () => '', 'empty'],
    ['одни пробелы', async () => ' \n\t ', 'empty'],
    ['обрезан до метки', async () => 'M73.1.z', 'corrupt'],
    ['не base64', async () => [...parts.slice(0, 5), '!!!!', ''].join('.'), 'corrupt'],
    ['обычный текст', async () => 'привет, это не код', 'not-code'],
  ];
  const reasons = new Set();
  for (const [name, make, reason] of cases) {
    let r;
    await assert.doesNotReject(async () => { r = await M.decodeTransfer(await make()); }, name);
    assert.deepEqual([r.ok, r.reason], [false, reason], name);
    reasons.add(r.reason);
  }
  assert.ok(reasons.size >= 6);
  // Любой одиночный сбой посреди gzip не оставляет необработанных отказов.
  let unhandled = 0;
  const onUn = () => { unhandled++; };
  process.on('unhandledRejection', onUn);
  for (let i = 0; i < 60; i += 7) await M.decodeTransfer(flip(10 + i * 9));
  await new Promise((r) => setTimeout(r, 30));
  process.off('unhandledRejection', onUn);
  assert.equal(unhandled, 0);
});

test('5. пределы: длинный вход и «бомба» сжатия', async () => {
  // Длиннее CODE_MAX — «слишком длинный» ещё до разбора (иначе вышло бы «не целиком»).
  const huge = 'M73.1.z.20261018.00000000.' + 'A'.repeat(M.CODE_MAX) + '.';
  assert.equal((await M.decodeTransfer(huge)).reason, 'too-long');
  assert.equal((await M.decodeTransfer('x'.repeat(M.CODE_MAX + 1))).reason, 'too-long');
  // gzip от 10 МБ нулей: отвергается, а распаковано не больше JSON_MAX + 64 КБ.
  const zeros = new Uint8Array(10 * 1024 * 1024);
  const gz = await (async () => {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter(); w.write(zeros); w.close();
    const chunks = []; const r = cs.readable.getReader();
    for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
    return Buffer.concat(chunks);
  })();
  assert.ok(gz.length < 20000);
  let produced = 0;
  class Counting extends DecompressionStream {
    constructor(f) {
      super(f);
      const orig = this.readable;
      const counted = orig.pipeThrough(new TransformStream({ transform(chunk, c) { produced += chunk.length; c.enqueue(chunk); } }));
      Object.defineProperty(this, 'readable', { value: counted });
    }
  }
  const code = `M73.1.z.20261018.00000000.${M.b64urlEncode(gz)}.`;
  const r = await M.decodeTransfer(code, { DecompressionStream: Counting });
  assert.equal(r.reason, 'too-long');
  assert.ok(produced <= M.JSON_MAX + 64 * 1024, `распаковано ${produced}`);
  // Без сжатия: 300 КБ данных → «слишком длинный».
  const big = new Uint8Array(300 * 1024).fill(97);
  assert.equal((await M.decodeTransfer(`M73.1.j.20261018.${M.crc32(big)}.${M.b64urlEncode(big)}.`)).reason, 'too-long');
  // Единица readIncoming — байты, а не знаки.
  assert.equal(readIncoming(' '.repeat(S.INCOMING_MAX_BYTES + 1)).reason, 'too-long');
  assert.equal(S.INCOMING_MAX_BYTES, M.JSON_MAX, 'пределы state.js и move.js совпадают');
  const cyr = '{"profile":{"name":"' + 'Я'.repeat(S.INCOMING_MAX_BYTES / 2 - 10) + '"}}';
  assert.ok(cyr.length < S.INCOMING_MAX_BYTES && readIncoming(cyr).reason === 'too-long', 'кириллица считается в байтах');
});

test('6. нет распаковщика: z → no-decompress; нет сжатия: отправитель делает j', async () => {
  const code = await CODE_Z(STATES['снимок v25']);
  assert.equal((await M.decodeTransfer(code, { DecompressionStream: undefined })).reason, 'no-decompress');
  const plain = await M.encodeTransfer(exportText(STATES['снимок v25']), { CompressionStream: undefined });
  assert.match(plain, /^M73\.1\.j\./);
  assert.equal((await M.decodeTransfer(plain, { DecompressionStream: undefined })).ok, true, 'j читается и без распаковщика');
});

test('7. не наш JSON', () => {
  for (const t of ['{}', '[]', '"x"', '1', '{"foo":1}', 'null', '{"progress":5}']) {
    assert.deepEqual(readIncoming(t), { ok: false, reason: 'not-state' }, t);
  }
  assert.equal(readIncoming('{не json').reason, 'not-json');
  assert.equal(readIncoming('{"profile":{"name":"A"}}').ok, true);
  assert.equal(readIncoming('{"progress":{}}').ok, true);
  assert.equal(readIncoming('{"profile":{"name":"A"}}').state.profile.name, 'A');
});

test('8. длина ссылки; ветка «код и файл» при малом пределе', async () => {
  const mx = STATES['максимум'];
  const z = await M.encodeTransfer(exportText(mx), { date: '20261018' });
  const j = await M.encodeTransfer(exportText(mx), { ...MODES.j, date: '20261018' });
  assert.ok(M.linkFor(z).length < 4000, `z: ${M.linkFor(z).length}`);
  assert.ok(M.linkFor(j).length < M.LINK_MAX, `j: ${M.linkFor(j).length}`);
  assert.equal((await M.buildTransfer(mx)).linkOk, true);
  const tiny = await M.buildTransfer(mx, { linkMax: 100 });
  assert.equal(tiny.ok, true);
  assert.equal(tiny.linkOk, false, 'ссылки нет, код есть');
  assert.ok(tiny.code.startsWith('M73.1.'));
});

test('8а. самопроверка отправителя: сломанный распаковщик → кнопки нет', async () => {
  const broken = { DecompressionStream: class { constructor() { return new TransformStream(); } } };
  assert.equal((await M.buildTransfer(STATES['снимок v25'], broken)).ok, false);
  assert.equal((await M.buildTransfer(STATES['снимок v25'])).ok, true);
});

// ——— 9. Ужесточение migrate ———
test('9. perChar: мусор убирается, настоящее проходит', () => {
  const bad = {
    'А': null, 'Б': { correct: '3', total: 5 }, 'В': { correct: 9, total: 5 }, 'Г': { correct: -1, total: 5 },
    'Д': { correct: 1, total: -5 }, 'Е': { correct: 1.5, total: 5 }, 'Ж': { correct: 2, total: 4, extra: 'x' },
    ['Я'.repeat(50)]: { correct: 1, total: 1 }, '': { correct: 1, total: 1 }, 'З': [1, 2],
  };
  const t = migrate({ progress: { ru: { perChar: bad } } }).progress.ru.perChar;
  assert.deepEqual(t, { 'В': { correct: 5, total: 5 }, 'Ж': { correct: 2, total: 4 } });
  const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [String.fromCharCode(0x400 + i), { correct: 1, total: 2 }]));
  const kept = Object.keys(migrate({ progress: { ru: { perChar: many } } }).progress.ru.perChar);
  assert.equal(kept.length, 200);
  assert.deepEqual(kept.slice(0, 3), ['\u0400', '\u0401', '\u0402'], 'порядок ключей сохраняется');
  // После этого главная не падает.
  const s = migrate({ progress: { ru: { perChar: { 'А': null, 'Б': { correct: 3, total: 5 } } } } });
  assert.doesNotThrow(() => G.avgAccuracy(s.progress.ru));
});

test('9. каждый знак, который знает DATA, проходит фильтр без изменений', () => {
  const all = [...DATA.RU_LETTERS, ...DATA.EN_LETTERS, ...DATA.DIGITS, ...DATA.PUNCTUATION]
    .map((x) => (typeof x === 'string' ? x : x.ch ?? x.char ?? x.c)).filter(Boolean);
  assert.ok(all.length > 60, `знаков найдено ${all.length}`);
  for (const ch of [...DATA.KOCH_ORDER_RU, ...DATA.KOCH_ORDER_EN, ...DATA.DIGIT_ORDER, ...all]) {
    const out = migrate({ progress: { ru: { perChar: { [ch]: { correct: 3, total: 5 } } } } }).progress.ru.perChar;
    assert.deepEqual(out, { [ch]: { correct: 3, total: 5 } }, `знак «${ch}»`);
  }
});

test('9. recent: к 0 или 1', () => {
  const r = migrate({ progress: { ru: { recent: [{}, '1', true, 1, 0] } } }).progress.ru.recent;
  assert.deepEqual(r, [0, 0, 1, 1, 0]);
});

test('9. parked: настоящий формат проходит, остальное выпадает', () => {
  const t = { learnedCount: 5, perChar: {}, recent: [], parked: [], lastFirst: null };
  const real = P.ensureStarted && (() => { const tr = { ...t, learnedCount: 9 }; P.parkNewest(tr, 'ru'); return tr.parked; })();
  assert.ok(real.length === 1 && typeof real[0].char === 'string' && Number.isInteger(real[0].returnAt), 'формат parkNewest');
  assert.deepEqual(migrate({ progress: { ru: { parked: real } } }).progress.ru.parked, real);
  const p = (parked) => migrate({ progress: { ru: { parked } } }).progress.ru.parked;
  assert.deepEqual(p(['Ь']), []);
  assert.deepEqual(p([{ char: 'Ь' }]), []);
  assert.deepEqual(p([{ char: 'ЬЬЬЬ', returnAt: 3 }]), []);
  assert.deepEqual(p([{ char: 'Ь', returnAt: -1 }]), []);
  assert.deepEqual(p([{ char: 'Ь', returnAt: 2.5 }]), []);
  assert.deepEqual(p([{ char: 'Ь', returnAt: 4, junk: 1 }]), [{ char: 'Ь', returnAt: 4 }], 'лишнее поле отброшено');
  assert.equal(p([{ char: 'А', returnAt: 1 }, { char: 'Б', returnAt: 2 }, { char: 'В', returnAt: 3 }]).length, 2);
});

test('9. настоящее состояние не меняется: вывод прежнего migrate (v27) и нового совпадает', () => {
  const raws = [v25State('2026-10-17'), maxState(), defaultState(), V27.defaultState()];
  for (const raw of raws) {
    const text = JSON.stringify(raw);
    assert.deepEqual(migrate(JSON.parse(text)), V27.migrate(JSON.parse(text)));
  }
});

test('9. миграция идемпотентна', () => {
  for (const s of Object.values(STATES)) {
    assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))), s);
    assert.deepEqual(migrate(migrate(s)), migrate(s));
  }
});

// ——— 10–12 ———
test('10. CRC-32: эталон', () => {
  assert.equal(M.crc32(new TextEncoder().encode('123456789')), 'cbf43926');
  assert.equal(M.crc32(new Uint8Array(0)), '00000000');
});

test('11. summary и isEmptyProgress', () => {
  const greeted = migrate({ profile: { name: 'Вася' } });
  assert.equal(M.isEmptyProgress(greeted), true, 'после знакомства — пусто');
  assert.equal(M.isEmptyProgress(defaultState()), true);
  const one = migrate({ profile: { name: 'Вася' }, progress: { ru: { perChar: { 'Е': { correct: 1, total: 1 } } } } });
  assert.equal(M.isEmptyProgress(one), false, 'один ответ');
  const sm = M.summary(STATES['снимок v25']);
  assert.deepEqual([sm.name, sm.ru, sm.en, sm.digits, sm.streak, sm.minutes, sm.radiogram, sm.points], ['Бонислав', 27, 6, 6, 9, 300, 100, 412]);
  assert.equal(sm.last, '2026-10-17', 'по журналу');
  const noHist = migrate({ profile: { name: 'А' }, streak: { current: 1, longest: 1, lastActiveDate: '2026-10-01' } });
  assert.equal(M.summary(noHist).last, '2026-10-01', 'при пустом журнале — по серии');
  assert.equal(M.summary(defaultState()).last, '');
});

test('16. isEmptyProgress: радиоигра, рекорд, веха, журнал, время, очки — не пусто', () => {
  const base = () => migrate({ profile: { name: 'А' } });
  const puz = base(); puz.puzzle.word.solved = ['w01'];
  assert.equal(M.isEmptyProgress(puz), false, 'разгаданный вопрос');
  const rec = base(); rec.records.radiogramCpm = 40;
  assert.equal(M.isEmptyProgress(rec), false, 'рекорд');
  const ms = base(); ms.milestones.first4 = true;
  assert.equal(M.isEmptyProgress(ms), false, 'веха');
  const h = base(); h.history = [{ date: '2026-10-01', answers: 1, accuracyPct: 100 }];
  assert.equal(M.isEmptyProgress(h), false, 'журнал');
  const t = base(); t.totalSeconds = 60;
  assert.equal(M.isEmptyProgress(t), false, '60 секунд');
  const t2 = base(); t2.totalSeconds = 59;
  assert.equal(M.isEmptyProgress(t2), true, '59 секунд');
  const pt = base(); pt.profile.points = 1;
  assert.equal(M.isEmptyProgress(pt), false, 'очки');
});

test('12. siteRole', () => {
  const L = (u) => new URL(u);
  assert.equal(M.siteRole(L('https://kbumanskiy.github.io/boni-m/')), 'old');
  assert.equal(M.siteRole(L('https://kbumanskiy.github.io/other/')), 'other');
  assert.equal(M.siteRole(L('https://app.morse73.ru/')), 'new');
  assert.equal(M.siteRole(L('http://app.morse73.ru/')), 'other');
  assert.equal(M.siteRole(L('http://localhost:8000/')), 'other');
  assert.equal(M.siteRole(L('https://example.com/')), 'other');
  assert.equal(M.siteRole(null), 'other');
});

test('сравнение и «здесь больше»', () => {
  const a = M.summary(STATES['снимок v25']);
  const few = M.summary(migrate({ profile: { name: 'Вася' }, progress: { ru: { learnedCount: 4 } } }));
  assert.equal(M.hereHasMore(a, few), false);
  assert.equal(M.hereHasMore(few, a), true);
  assert.equal(M.hereHasMore(a, a), false, 'поровну — не «больше»');
  const rows = M.compareRows(a, few);
  assert.equal(rows.find((r) => r.key === 'name').differs, true);
  assert.equal(rows.find((r) => r.key === 'ru').a, '27 из 32');
  assert.equal(rows.find((r) => r.key === 'ru').b, '4 из 32');
  assert.ok(rows.some((r) => r.key === 'en'), 'латиница показана, если у кого-то есть');
  assert.ok(!M.compareRows(few, few).some((r) => r.key === 'en' || r.key === 'puzzle'), 'нулевые строки скрыты');
});

test('movedInfo: «открывали» / «занимались после»', () => {
  const st = migrate({ progress: { ru: { perChar: { 'Е': { correct: 3, total: 4 } } } }, totalSeconds: 600 });
  assert.equal(M.movedInfo(null, st).kind, 'none');
  const meta = { at: '2026-10-18', secs: 600, answers: 4 };
  assert.equal(M.movedInfo(meta, st).kind, 'opened');
  assert.equal(M.movedInfo(meta, { ...st, totalSeconds: 660 }).kind, 'opened', '+60 секунд — ещё нет');
  assert.equal(M.movedInfo(meta, { ...st, totalSeconds: 661 }).kind, 'stale');
  const more = migrate({ progress: { ru: { perChar: { 'Е': { correct: 3, total: 5 } } } }, totalSeconds: 600 });
  assert.equal(M.movedInfo(meta, more).kind, 'stale', 'больше ответов');
  assert.equal(M.movedInfo(meta, st).at, '2026-10-18');
  assert.equal(M.answersOf(st), 4);
});

// ——— 13. Формат v1 навсегда ———
test('13. выпущенные образцы формата v1 читаются текущим кодом (SHA-256 зафиксирован)', async () => {
  const dir = new URL('../fixtures/move-v1/', import.meta.url);
  const SHA = {
    'sample.json': 'f3b8493deec3171e7b0da33ffb8f92d8d94224220fa51e26380ccde98955ccb7',
    'sample-j.txt': '59cda7aa04da1ab8be149c6b501b4ec67f91dbf4ff5e2070e3667affdca5c282',
    'sample-z.txt': '9a6b8d528afb1de222e1beb907dd56a9aa9cfdf89ba86a45b47ac2505dd39a7a',
  };
  for (const [f, h] of Object.entries(SHA)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(f, dir))).digest('hex'), h, `${f}: образец изменён — формат v1 менять нельзя`);
  }
  const want = JSON.parse(readFileSync(new URL('sample.json', dir), 'utf8'));
  for (const f of ['sample-z.txt', 'sample-j.txt']) {
    const d = await M.decodeTransfer(readFileSync(new URL(f, dir), 'utf8'));
    assert.equal(d.ok, true, f);
    assert.equal(d.date, '2026-10-18');
    assert.deepEqual(JSON.parse(d.json), want, f);
    assert.deepEqual(readIncoming(d.json).state, migrate(want), f);
  }
});

// ——— 14. Единственный вход ———
test('14. app.js: чужое состояние идёт только через readIncoming, запись основного ключа — только через save', () => {
  const src = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const lines = src.split('\n');
  const parses = lines.map((l, i) => [i + 1, l.trim()]).filter(([, l]) => l.includes('JSON.parse('));
  // Каждое место зафиксировано: к состоянию из файла/кода/ссылки оно не относится.
  const allowed = [
    /JSON\.parse\(s\)/, // не используется: список оставлен пустым, пока в app.js нет разборов
  ];
  void allowed;
  assert.deepEqual(parses.map(([, l]) => l), [], `JSON.parse в app.js: ${JSON.stringify(parses)}`);
  assert.ok(!src.includes("localStorage.setItem('boni_m_state'"), "запись 'boni_m_state' мимо save");
  assert.ok(!/setItem\(\s*'boni_m_state'/.test(src), "запись 'boni_m_state' мимо save (2)");
  assert.ok(!/migrate\(/.test(src), 'migrate для чужого состояния в app.js не вызывается');
  assert.ok(/readIncoming/.test(src), 'приём идёт через readIncoming');
});

// ——— 15. Страховочный список ———
function mapStore(opts = {}) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (opts.failKey === k) throw new Error('квота');
      if (opts.badReadKey === k) { m.set(k, 'испорчено'); return; }
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
}
const mk = (name, answers, extra = {}) => migrate({ profile: { name }, progress: { ru: { learnedCount: 4,
  perChar: { 'Е': { correct: answers, total: answers } } } }, ...extra });
const doSave = (st) => (state) => S.save(state, st);
const slotOf = (st) => JSON.parse(st.getItem(M.KEY_SLOT) || '[]');
const rawOf = (st) => st.getItem('boni_m_state');

function putState(st, s) { st.setItem('boni_m_state', JSON.stringify(s)); }
function apply(st, incoming, extra = {}) {
  return M.applyImport(incoming, { storage: st, expectRaw: st.getItem('boni_m_state'), save: doSave(st), at: '2026-10-18', ...extra });
}

test('15. слот: A → Б → список [A]; повтор Б — «уже здесь», ничего не пишется', () => {
  const st = mapStore();
  const A = mk('А', 3), B = mk('Б', 9);
  putState(st, A);
  const rawA = rawOf(st);
  let r = apply(st, B);
  assert.equal(r.ok, true);
  assert.deepEqual(slotOf(st).map((e) => e.state), [rawA]);
  assert.deepEqual(readIncoming(rawOf(st)).state, B);
  const slotBefore = st.getItem(M.KEY_SLOT), markBefore = st.getItem(M.KEY_IMPORT_AT), rawBefore = rawOf(st);
  r = apply(st, B);
  assert.deepEqual(r, { ok: true, same: true });
  assert.equal(st.getItem(M.KEY_SLOT), slotBefore);
  assert.equal(st.getItem(M.KEY_IMPORT_AT), markBefore, 'метка не тронута');
  assert.equal(rawOf(st), rawBefore);
});

test('15. слот: A → Б → Б+ → В → [Б+, A]; вернуть A → основное A, список [В, Б+, A]', () => {
  const st = mapStore();
  const A = mk('А', 3), B = mk('Б', 9), Bp = mk('Б', 12), V = mk('В', 20);
  putState(st, A);
  const rawA = rawOf(st);
  apply(st, B);
  putState(st, Bp); const rawBp = rawOf(st);
  apply(st, V);
  const rawV = rawOf(st);
  assert.deepEqual(slotOf(st).map((e) => e.state), [rawBp, rawA]);
  const list = slotOf(st);
  const back = readIncoming(list[1].state);
  assert.equal(back.ok, true);
  const r = apply(st, back.state);
  assert.equal(r.ok, true);
  assert.deepEqual(readIncoming(rawOf(st)).state, A);
  assert.deepEqual(slotOf(st).map((e) => e.state), [rawV, rawBp, rawA], 'выбранное остаётся в списке');
});

test('15. слот: ключа основного нет → список не трогается; «пустое», но с радиоигрой → попадает', () => {
  const st = mapStore();
  const r = apply(st, mk('Б', 5));
  assert.equal(r.ok, true);
  assert.equal(st.getItem(M.KEY_SLOT), null, 'список не создан');
  const st2 = mapStore();
  const puz = migrate({ profile: { name: 'А' } }); puz.puzzle.word.solved = ['w01'];
  assert.equal(M.isEmptyProgress(migrate({ profile: { name: 'А' } })), true);
  putState(st2, puz);
  apply(st2, mk('Б', 5));
  assert.equal(slotOf(st2).length, 1, 'прежнее с радиоигрой в списке');
  // Даже совсем «пустое» кладётся: пустоту при записи не оценивают.
  const st3 = mapStore(); putState(st3, migrate({ profile: { name: 'А' } }));
  apply(st3, mk('Б', 5));
  assert.equal(slotOf(st3).length, 1);
});

test('15. слот: отказы записи — основное не тронуто', () => {
  // Отказ записи списка.
  let st = mapStore({ failKey: M.KEY_SLOT });
  putState(st, mk('А', 3)); let raw = rawOf(st);
  let r = apply(st, mk('Б', 9));
  assert.deepEqual([r.ok, r.reason], [false, 'write']);
  assert.equal(rawOf(st), raw);
  assert.equal(st.getItem(M.KEY_IMPORT_AT), null);
  // Обратное чтение не совпало.
  st = mapStore({ badReadKey: M.KEY_SLOT });
  putState(st, mk('А', 3)); raw = rawOf(st);
  r = apply(st, mk('Б', 9));
  assert.deepEqual([r.ok, r.reason], [false, 'write']);
  assert.equal(rawOf(st), raw);
  // Отказ записи метки.
  st = mapStore({ failKey: M.KEY_IMPORT_AT });
  putState(st, mk('А', 3)); raw = rawOf(st);
  r = apply(st, mk('Б', 9));
  assert.deepEqual([r.ok, r.reason], [false, 'write']);
  assert.equal(rawOf(st), raw, 'основное не тронуто');
  // Отказ записи основного: основное прежнее, в списке его копия.
  st = mapStore(); putState(st, mk('А', 3)); raw = rawOf(st);
  const failing = mapStore();
  failing.m = st.m;
  const realSet = st.setItem;
  st.setItem = (k, v) => { if (k === 'boni_m_state') throw new Error('квота'); return realSet(k, v); };
  r = apply(st, mk('Б', 9));
  assert.deepEqual([r.ok, r.reason], [false, 'write']);
  assert.equal(rawOf(st), raw);
  assert.deepEqual(slotOf(st).map((e) => e.state), [raw]);
});

test('15. слот: 20 разных замен подряд — 20 элементов, ни один не потерян', () => {
  const st = mapStore();
  putState(st, mk('нач', 1));
  const seen = [rawOf(st)];
  for (let i = 2; i <= 21; i++) {
    const s = mk(`Н${i}`, i);
    assert.equal(apply(st, s).ok, true);
    if (i < 21) seen.push(rawOf(st));
  }
  const list = slotOf(st).map((e) => e.state);
  assert.equal(list.length, 20);
  assert.deepEqual([...list].reverse(), seen);
});

test('15. слот: больше 1 МБ → отказ без записи; «Удалить» освобождает место; без подтверждения ничего не удаляется', () => {
  const st = mapStore();
  const filler = (i) => ({ at: '2026-10-01', state: 'x'.repeat(100000) + i });
  const list = Array.from({ length: 11 }, (_, i) => filler(i));
  st.setItem(M.KEY_SLOT, JSON.stringify(list));
  putState(st, mk('А', 3)); const raw = rawOf(st);
  const slotBefore = st.getItem(M.KEY_SLOT);
  let r = apply(st, mk('Б', 9));
  assert.deepEqual([r.ok, r.reason], [false, 'slot-full']);
  assert.equal(rawOf(st), raw); assert.equal(st.getItem(M.KEY_SLOT), slotBefore); assert.equal(st.getItem(M.KEY_IMPORT_AT), null);
  // Само приложение ничего не удаляет: список прежний после отказа (выше). Удаляет только вызов removeFromSlot.
  const del = M.removeFromSlot(list[0].state, st);
  assert.equal(del.ok, true);
  assert.equal(slotOf(st).length, 10);
  r = apply(st, mk('Б', 9));
  assert.equal(r.ok, true);
  assert.equal(slotOf(st).length, 11);
});

test('15. слот: нечитаемый список не затирается', () => {
  const st = mapStore();
  st.setItem(M.KEY_SLOT, '{не json');
  putState(st, mk('А', 3)); const raw = rawOf(st);
  const r = apply(st, mk('Б', 9));
  assert.deepEqual([r.ok, r.reason], [false, 'write']);
  assert.equal(st.getItem(M.KEY_SLOT), '{не json');
  assert.equal(rawOf(st), raw);
});

test('15. другое окно успело записать: перед записью основное перечитывается', () => {
  const st = mapStore();
  putState(st, mk('А', 3)); const rawShown = rawOf(st);
  putState(st, mk('А', 4)); // «другое окно»
  const r = M.applyImport(mk('Б', 9), { storage: st, expectRaw: rawShown, save: doSave(st), at: '2026-10-18' });
  assert.deepEqual([r.ok, r.reason], [false, 'changed']);
  assert.equal(st.getItem(M.KEY_SLOT), null);
  assert.deepEqual(readIncoming(rawOf(st)).state, mk('А', 4));
  const r2 = M.applyImport(mk('Б', 9), { storage: st, expectRaw: rawOf(st), save: doSave(st), at: '2026-10-18' });
  assert.equal(r2.ok, true);
  assert.deepEqual(readIncoming(slotOf(st)[0].state).state, mk('А', 4), 'в список попало «прежнее + 1 ответ»');
});

test('отметка «переносили» и список читаются и пишутся без исключений', () => {
  const st = mapStore();
  assert.equal(M.loadMoved(st), null);
  assert.equal(M.saveMoved({ at: '2026-10-18', secs: 5, answers: 2 }, st), true);
  assert.deepEqual(M.loadMoved(st), { at: '2026-10-18', secs: 5, answers: 2 });
  st.setItem(M.KEY_MOVED, 'мусор');
  assert.equal(M.loadMoved(st), null);
  assert.deepEqual(M.readSlot(st), { ok: true, list: [] });
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(M.saveMoved({ at: 'a' }, broken), false);
  assert.equal(M.loadMoved(broken), null);
  assert.equal(M.readSlot(broken).ok, false);
});

test('перенос не добавляет полей в состояние', () => {
  for (const s of Object.values(STATES)) {
    assert.deepEqual(Object.keys(migrate(s)).sort(), Object.keys(defaultState()).sort());
  }
  assert.ok(!exportText(maxState()).includes('boni_m_metrics'), 'номера установки статистики в строке нет');
});
