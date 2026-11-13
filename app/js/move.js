// Переезд на app.morse73.ru без потери прогресса (ТЗ-переезд.md). Чистая логика: без DOM.
// Единственное, что трогает хранилище, — несколько мелких функций с ключами
// boni_m_moved, boni_m_state_before_move, boni_m_import_at (всё в try/catch, как в metrics.js).
//
// Состояние в строку и обратно: M73.<версия>.<сжатие>.<дата>.<crc32>.<данные>.
// Внутри лежит ровно тот JSON, что пишет «Сохранить копию» (exportText из state.js).
// Принимает строку ОДИН вход — readIncoming из state.js; здесь только упаковка.
//
// Из state.js берём только пространство имён: при смешанном кэше (новый app.js со старым
// state.js) именованный импорт несуществующей функции не дал бы запуститься всему приложению.
import * as S from './state.js';
import * as P from './progress.js';
import * as PZ from './puzzle.js';
import * as G from './gamify.js';

export const NEW_ORIGIN = 'https://app.morse73.ru';
export const OLD_HOST = 'kbumanskiy.github.io';
export const OLD_PATH = '/boni-m/';
export const MOVE_SETTINGS = true;   // П1: карточка в настройках старого адреса
export const MOVE_HOME = false;      // П2 → true: карточка на главной и строка на знакомстве
export const MOVE_FINAL = false;     // заморозка (ТЗ 10.7) → true только в последней сборке для Pages

// Пределы (ТЗ 3.2). Единица везде — знаки строки или байты UTF-8, как сказано у каждого.
export const LINK_MAX = 32000;       // знаков на весь адрес
export const CODE_MAX = 400000;      // знаков на входе
export const JSON_MAX = 262144;      // байт после распаковки
export const SLOT_MAX = 1048576;     // знаков в списке прежних версий (≈1 МБ)
export const FORMAT_VERSION = 1;

export const KEY_MOVED = 'boni_m_moved';
export const KEY_SLOT = 'boni_m_state_before_move';
export const KEY_IMPORT_AT = 'boni_m_import_at';
export const SLOT_BROKEN_PREFIX = 'boni_m_state_before_move_broken_'; // нечитаемый список лежит здесь как есть
const KEY_STATE = 'boni_m_state';

// Где мы находимся. old — только отправляет, new — только принимает, other — принимает,
// чтобы проверять локально, не отправляет.
export function siteRole(loc) {
  try {
    if (loc.hostname === OLD_HOST && String(loc.pathname || '').startsWith(OLD_PATH)) return 'old';
    if (loc.origin === NEW_ORIGIN) return 'new';
  } catch {}
  return 'other';
}

// ——— CRC-32 (IEEE, как в zip) ———
let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

// ——— base64url (RFC 4648 §5): - и _, без = ———
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_REV = (() => { const m = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) m[B64.charCodeAt(i)] = i; return m; })();

export function b64urlEncode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (i + 2 < bytes.length) out += B64[b2 & 63];
  }
  return out;
}

// null — если в строке посторонний знак или длина невозможна (остаток 1 знак).
export function b64urlDecode(str) {
  if (typeof str !== 'string' || str.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((str.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < str.length; i += 4) {
    const v = [];
    for (let j = 0; j < 4 && i + j < str.length; j++) {
      const c = str.charCodeAt(i + j);
      const d = c < 128 ? B64_REV[c] : -1;
      if (d < 0) return null;
      v.push(d);
    }
    out[o++] = (v[0] << 2) | (v[1] >> 4);
    if (v.length > 2) out[o++] = ((v[1] & 15) << 4) | (v[2] >> 2);
    if (v.length > 3) out[o++] = ((v[2] & 3) << 6) | v[3];
  }
  return out.subarray(0, o);
}

// ——— Потоки gzip ———
// Параметры передаются снаружи, чтобы тесты могли подменить их на «нет» или на счётчик.
async function pump(stream, bytes, limit) {
  const writer = stream.writable.getWriter();
  // Запись и чтение идут одновременно: иначе большой вход упирается в обратное давление.
  // Ошибки записи не должны всплывать «необработанными»: итог узнаём по чтению.
  writer.write(bytes).then(() => writer.close()).catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (limit != null && total > limit) {
        try { await reader.cancel(); } catch {}
        try { writer.abort?.().catch(() => {}); } catch {}
        return { tooLong: true };
      }
      chunks.push(value);
    }
  } catch {
    return { broken: true };
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return { bytes: out };
}

const pick = (opts, name) => (opts && name in opts ? opts[name] : globalThis[name]);
const pad2 = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

// Строка переноса. z — gzip (если он есть в этом браузере), иначе j — без сжатия.
export async function encodeTransfer(jsonText, opts = {}) {
  const bytes = new TextEncoder().encode(jsonText);
  const CS = pick(opts, 'CompressionStream');
  let mode = 'j';
  let body = bytes;
  if (typeof CS === 'function') {
    try {
      const r = await pump(new CS('gzip'), bytes, null);
      if (r.bytes) { mode = 'z'; body = r.bytes; }
    } catch {}
  }
  const date = opts.date || stamp();
  return `M73.${FORMAT_VERSION}.${mode}.${date}.${crc32(bytes)}.${b64urlEncode(body)}.`;
}

// Выбросить все пробельные знаки (почта и мессенджеры рвут длинные строки), найти первое
// «M73.», взять до ШЕСТОЙ точки включительно; без неё — до первого знака вне base64url.
const SPACES = /[\s​-‍⁠﻿]/g;
export function extractCode(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(SPACES, '');
  const i = t.indexOf('M73.');
  if (i < 0) return null;
  let dots = 0;
  let end = i;
  for (; end < t.length; end++) {
    const ch = t[end];
    if (ch === '.') { dots++; if (dots === 6) { end++; break; } continue; }
    if (!/[A-Za-z0-9_-]/.test(ch)) break;
  }
  return t.slice(i, end);
}

function validDate(d) {
  if (!/^\d{8}$/.test(d)) return false;
  const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6, 8);
  if (y < 2000 || y > 2200 || m < 1 || m > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// → { ok: true, json, date: 'ГГГГ-ММ-ДД' } | { ok: false, reason }
// reason: empty · not-code · too-long · newer · bad-format · bad-mode · bad-date · corrupt · no-decompress
// Исключения наружу не вылетают.
export async function decodeTransfer(text, opts = {}) {
  try {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
    if (text.length > CODE_MAX) return { ok: false, reason: 'too-long' };
    const code = extractCode(text);
    if (!code) return { ok: false, reason: 'not-code' };
    const parts = code.split('.');
    // [M73, версия, сжатие, дата, crc, данные, ''?]
    const ver = parts[1] || '';
    if (!/^\d+$/.test(ver)) return { ok: false, reason: 'bad-format' };
    // Версию 1 принимаем всегда; всё новее — просим обновить приложение.
    if (+ver > FORMAT_VERSION) return { ok: false, reason: 'newer' };
    if (+ver < 1) return { ok: false, reason: 'bad-format' };
    const mode = parts[2];
    if (mode !== 'z' && mode !== 'j') return { ok: false, reason: 'bad-mode' };
    const date = parts[3];
    if (parts.length < 5) return { ok: false, reason: 'corrupt' };
    if (!validDate(date || '')) return { ok: false, reason: 'bad-date' };
    const crc = parts[4];
    const data = parts[5] ?? '';
    if (!/^[0-9a-f]{8}$/.test(crc || '') || !data) return { ok: false, reason: 'corrupt' };
    const raw = b64urlDecode(data);
    if (!raw) return { ok: false, reason: 'corrupt' };
    let bytes = raw;
    if (mode === 'z') {
      const DS = pick(opts, 'DecompressionStream');
      if (typeof DS !== 'function') return { ok: false, reason: 'no-decompress' };
      let r;
      try { r = await pump(new DS('gzip'), raw, JSON_MAX); } catch { return { ok: false, reason: 'corrupt' }; }
      if (r.tooLong) return { ok: false, reason: 'too-long' };
      if (!r.bytes) return { ok: false, reason: 'corrupt' };
      bytes = r.bytes;
    }
    if (bytes.length > JSON_MAX) return { ok: false, reason: 'too-long' };
    if (crc32(bytes) !== crc) return { ok: false, reason: 'corrupt' };
    let json;
    try { json = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return { ok: false, reason: 'corrupt' }; }
    return { ok: true, json, date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

export const linkFor = (code) => `${NEW_ORIGIN}/#perenos=${code}`;

// Равенство без учёта порядка ключей.
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

// Всё, что нужно старому адресу для кнопки: код, ссылка и самопроверка. Самопроверка —
// раскодировать собственный код тем же приёмником и сравнить с migrate(состояние): если
// на редком телефоне что-то не так, кнопки не будет вместо тихой потери.
// → { ok: true, code, link, linkOk } | { ok: false }
// linkOk: false — адрес длиннее предела; код и файл остаются.
export async function buildTransfer(state, opts = {}) {
  try {
    if (typeof S.readIncoming !== 'function' || typeof S.exportText !== 'function') return { ok: false };
    const text = S.exportText(state);
    const code = await encodeTransfer(text, opts);
    const back = await decodeTransfer(code, opts);
    if (!back.ok) return { ok: false };
    const rd = S.readIncoming(back.json);
    if (!rd.ok || !deepEqual(rd.state, S.migrate(JSON.parse(text)))) return { ok: false };
    const link = linkFor(code);
    return { ok: true, code, link, linkOk: link.length <= (opts.linkMax ?? LINK_MAX) };
  } catch {
    return { ok: false };
  }
}

// ——— Сводка и сравнение ———
const sumTotals = (state) => ['ru', 'en'].reduce((n, a) => n + Object.values(state.progress?.[a]?.perChar || {})
  .reduce((m, pc) => m + (pc && pc.total > 0 ? pc.total : 0), 0), 0);
export const answersOf = sumTotals;

export function summary(state) {
  const ru = state.progress.ru, en = state.progress.en;
  const lastHist = state.history.length ? state.history[state.history.length - 1].date : '';
  return {
    name: state.profile.name || '',
    ru: ru.learnedCount,
    en: en.learnedCount,
    digits: Math.max(ru.digitsLearned, en.digitsLearned),
    streak: state.streak.current,
    minutes: Math.round(state.totalSeconds / 60),
    radiogram: state.records.radiogramCpm || 0,
    points: state.profile.points,
    puzzle: PZ.solvedTotal(state.puzzle),
    milestones: Object.keys(state.milestones).length,
    last: lastHist || state.streak.lastActiveDate || '',
  };
}

// Строки сравнения и подтверждения (решение 12.11.2026, упрощение экранов): ровно четыре —
// подпись, значение «со старого адреса», значение «здесь», differs.
export function compareRows(inc, cur) {
  const fmtDate = (d) => (d ? G.formatDate(d) : '—');
  return [
    { key: 'name', label: 'Имя', a: inc.name || '—', b: cur.name || '—', differs: inc.name !== cur.name },
    { key: 'ru', label: 'Освоено букв', a: `${inc.ru} из 32`, b: `${cur.ru} из 32`, differs: inc.ru !== cur.ru },
    { key: 'digits', label: 'Освоено цифр', a: `${inc.digits} из 10`, b: `${cur.digits} из 10`, differs: inc.digits !== cur.digits },
    { key: 'last', label: 'Последнее занятие', a: fmtDate(inc.last), b: fmtDate(cur.last), differs: inc.last !== cur.last },
  ];
}

// «Здесь прогресса больше»: по всем числам здешнее не меньше пришедшего, и хотя бы одно больше.
export function hereHasMore(inc, cur) {
  const keys = ['ru', 'en', 'digits', 'streak', 'minutes', 'radiogram', 'points', 'puzzle', 'milestones'];
  return keys.every((k) => cur[k] >= inc[k]) && keys.some((k) => cur[k] > inc[k]);
}

// Пусто — когда человеку терять нечего: ни ответов, ни журнала, меньше минуты в эфире, ни очков,
// ни разгаданной радиоигры, ни рекорда радиограммы, ни вех. Имя не в счёт.
// Решает ТОЛЬКО то, что показать (подтверждение или сравнение). Сохранять ли прежнее в список
// прежних версий, решает другое, более широкое правило — там пустоту не оценивают вовсе.
export function isEmptyProgress(state) {
  if (P.hasAnswered(state.progress.ru) || P.hasAnswered(state.progress.en)) return false;
  if (state.history.length) return false;
  if (state.totalSeconds >= 60) return false;
  if (state.profile.points !== 0) return false;
  if (PZ.solvedTotal(state.puzzle) > 0) return false;
  if ((state.records.radiogramCpm || 0) > 0) return false;
  if (Object.keys(state.milestones).length > 0) return false;
  return true;
}

// Отметка старого адреса «открывали перенос» → что сказать на карточке.
// → { kind: 'none' | 'opened' | 'stale', at }
export function movedInfo(meta, state) {
  if (!meta || typeof meta !== 'object' || typeof meta.at !== 'string') return { kind: 'none', at: '' };
  const secs = Number.isFinite(meta.secs) ? meta.secs : 0;
  const answers = Number.isFinite(meta.answers) ? meta.answers : 0;
  const stale = state.totalSeconds > secs + 60 || sumTotals(state) > answers;
  return { kind: stale ? 'stale' : 'opened', at: meta.at };
}

// ——— Список прежних версий ———
// Элемент: { at: 'ГГГГ-ММ-ДД', state: <сырая строка boni_m_state> }, новое первым.
// Автоматически не удаляется и не перезаписывается ничего: удалить может только человек.

// Что записать при «Да» (ТЗ 3.4, шаги 2–3). Чистая функция.
//   currentRaw — сырая строка boni_m_state (или null, если ключа нет);
//   list — нынешний список; incoming — состояние после migrate.
// → { ok: true, same: true }                       — уже здесь, ничего не писать
//   { ok: true, same: false, list, listChanged }   — записать list (если listChanged), затем основное
//   { ok: false, reason: 'slot-full' }             — места под прежние версии не осталось
export function planImport(currentRaw, list, incoming, at = '') {
  const cur = typeof currentRaw === 'string' ? currentRaw : null;
  if (cur !== null) {
    try {
      const rd = typeof S.readIncoming === 'function' ? S.readIncoming(cur) : { ok: true, state: S.migrate(JSON.parse(cur)) };
      if (rd.ok && deepEqual(rd.state, incoming)) return { ok: true, same: true };
    } catch {}
  }
  let next = list;
  let listChanged = false;
  if (cur !== null && !list.some((e) => e && e.state === cur)) {
    next = [{ at, state: cur }, ...list];
    listChanged = true;
    if (JSON.stringify(next).length > SLOT_MAX) return { ok: false, reason: 'slot-full' };
  }
  return { ok: true, same: false, list: next, listChanged };
}

// ——— Хранилище: мелкие функции, всё в try/catch ———
function store(st) {
  if (st) return st;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function loadMoved(st) {
  try {
    const raw = store(st)?.getItem(KEY_MOVED);
    if (!raw) return null;
    const m = JSON.parse(raw);
    return m && typeof m === 'object' && typeof m.at === 'string' ? m : null;
  } catch { return null; }
}
export function saveMoved(meta, st) {
  try { store(st).setItem(KEY_MOVED, JSON.stringify(meta)); return true; } catch { return false; }
}

function hash4(str) {
  let h = 0x811c9dc5; // FNV-1a, как в state.js
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, 4);
}

// → { ok: true, list } | { ok: false, raw? }  (raw — сырая строка, если она есть, но не читается; ключа нет — пустой список; нечитаемое — ok:false:
// затирать неизвестное содержимое нельзя)
export function readSlot(st) {
  try {
    const raw = store(st).getItem(KEY_SLOT);
    if (raw === null || raw === undefined) return { ok: true, list: [] };
    let list;
    try { list = JSON.parse(raw); } catch { return { ok: false, raw }; }
    if (!Array.isArray(list)) return { ok: false, raw };
    const clean = list.filter((e) => e && typeof e === 'object' && typeof e.state === 'string' && typeof e.at === 'string');
    if (clean.length !== list.length) return { ok: false, raw };
    return { ok: true, list: clean };
  } catch { return { ok: false }; }
}

// Нечитаемый список прежних версий: переложить как есть в свой аварийный слот, проверить
// чтением и только потом очистить исходный ключ. Ничего чужого не удаляется (слотов не лимитируем).
// → true — копия подтверждена и список начат заново; false — хранилище отказало, ничего не тронуто
// (кроме, возможно, лишней копии).
function quarantineSlot(st, raw, at) {
  try {
    const base = `${SLOT_BROKEN_PREFIX}${at || 'x'}`;
    let key = base;
    for (let n = 2; st.getItem(key) !== null && st.getItem(key) !== raw; n++) key = `${base}_${n}`;
    if (st.getItem(key) !== raw) {
      st.setItem(key, raw);
      if (st.getItem(key) !== raw) return false;
    }
    st.removeItem(KEY_SLOT);
    return st.getItem(KEY_SLOT) === null;
  } catch { return false; }
}

export function readMark(st) {
  try { return store(st)?.getItem(KEY_IMPORT_AT) ?? null; } catch { return null; }
}

// Запись при «Да» / «Вернуть эту»: ТЗ 3.4, шаги 1–4. Порядок — сначала страховка:
//   перечитать основное (не то, что рисовали → 'changed') → список + проверка чтением →
//   boni_m_import_at → save основного. Отказ на любом шаге до save: основное не тронуто.
// opts: { expectRaw, save(state) → bool, at, mark }
// → { ok: true, same?: true } | { ok: false, reason: 'changed' | 'slot-full' | 'write' }
export function applyImport(incoming, opts) {
  const st = store(opts.storage);
  if (!st) return { ok: false, reason: 'write' };
  let cur;
  try { cur = st.getItem(KEY_STATE); } catch { return { ok: false, reason: 'write' }; }
  if ((cur ?? null) !== (opts.expectRaw ?? null)) return { ok: false, reason: 'changed' };
  let slot = readSlot(st);
  if (!slot.ok && typeof slot.raw === 'string') {
    if (!quarantineSlot(st, slot.raw, `${opts.at || ''}_${hash4(slot.raw)}`)) return { ok: false, reason: 'write' };
    slot = readSlot(st);
  }
  if (!slot.ok) return { ok: false, reason: 'write' };
  const plan = planImport(cur, slot.list, incoming, opts.at || '');
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (plan.same) return { ok: true, same: true };
  if (plan.listChanged) {
    try {
      const text = JSON.stringify(plan.list);
      st.setItem(KEY_SLOT, text);
      if (st.getItem(KEY_SLOT) !== text) return { ok: false, reason: 'write' };
    } catch { return { ok: false, reason: 'write' }; }
  }
  const mark = opts.mark || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    st.setItem(KEY_IMPORT_AT, mark);
    if (st.getItem(KEY_IMPORT_AT) !== mark) return { ok: false, reason: 'write' };
  } catch { return { ok: false, reason: 'write' }; }
  if (opts.save(incoming) !== true) return { ok: false, reason: 'write' };
  return { ok: true, mark };
}

// «Удалить» одну прежнюю версию: единственный путь, которым элемент списка исчезает.
// Элемент опознаётся по тексту состояния, а не по номеру: список мог измениться в другом окне.
export function removeFromSlot(stateRaw, st) {
  const s = store(st);
  const slot = readSlot(s);
  if (!slot.ok) return { ok: false };
  const next = slot.list.filter((e) => e.state !== stateRaw);
  try {
    const text = JSON.stringify(next);
    s.setItem(KEY_SLOT, text);
    return s.getItem(KEY_SLOT) === text ? { ok: true, list: next } : { ok: false };
  } catch { return { ok: false }; }
}

// Текст ошибки по причине (ТЗ 5.4). Один источник на ссылку, код и файл.
export const ERRORS = {
  empty: 'Поле пустое. Вставьте код из старого приложения.',
  'not-code': 'Это не код переноса. Скопируйте его ещё раз в старом приложении: «Настройки» → «Скопировать код переноса».',
  corrupt: 'Код скопировался не целиком. Скопируйте его ещё раз.',
  newer: 'Код сделан более новой версией приложения. Закройте приложение и откройте снова — оно обновится. Потом вставьте код ещё раз.',
  'bad-format': 'Код скопировался не целиком. Скопируйте его ещё раз.',
  'bad-mode': 'Код скопировался не целиком. Скопируйте его ещё раз.',
  'bad-date': 'Код скопировался не целиком. Скопируйте его ещё раз.',
  'no-decompress': 'Этот браузер не может прочитать код. Перенесите файлом: в старом приложении «Настройки» → «Сохранить копию», здесь — «Восстановить из копии».',
  'too-long': 'Это не код переноса: он слишком длинный.',
  'not-json': 'В коде нет прогресса «Школы Морзе 73».',
  'not-state': 'В коде нет прогресса «Школы Морзе 73».',
  write: 'Не получилось сохранить в этом браузере — возможно, включён режим «Инкогнито» или кончилось место. Прогресс на старом адресе цел.',
  'slot-full': 'Место для прежних версий в этом браузере закончилось. Откройте «Настройки» → «Резервная копия» → «Вернуть как было» и удалите ненужные версии. Потом повторите.',
};
