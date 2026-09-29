// Радиоигра: каталог, колода, картинки. Концепт — КОНЦЕПТ-викторина.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATS, CAT_IDS, CATALOG, TOTAL, ROUND, idsOf, qById, catById,
  deckFresh, deckClean, deckDraw, shuffle, markSolved,
  puzzleFresh, puzzleClean, solvedCount, solvedTotal,
} from '../app/js/puzzle.js';
import { RU_LETTERS, DIGITS } from '../app/js/data.js';
import { PIC, picSVG, ICON } from '../app/js/icons.js';

// Случайность с зерном: тест воспроизводим.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const all = () => CAT_IDS.flatMap((c) => CATALOG[c].map((q) => ({ ...q, cat: c })));

test('четыре категории по 30 вопросов, всего 120', () => {
  assert.deepEqual(CAT_IDS, ['word', 'msg', 'riddle', 'story']);
  assert.deepEqual(CATS.map((c) => c.name), ['Слово', 'Сообщение', 'Загадка', 'Из истории']);
  for (const c of CAT_IDS) assert.equal(CATALOG[c].length, 30, c);
  assert.equal(TOTAL, 120);
  assert.equal(ROUND, 5);
  assert.equal(catById('story').name, 'Из истории');
  assert.equal(catById('нет'), null);
});

test('каждый знак текстов есть в курсе (буквы и цифры data.js), пробел — граница слова', () => {
  const known = new Set([...RU_LETTERS.map((l) => l.char), ...DIGITS.map((d) => d.char)]);
  for (const q of all()) {
    for (const ch of q.text.replace(/ /g, '')) {
      assert.ok(known.has(ch), `${q.id}: знак «${ch}» не из курса`);
    }
    assert.ok(!/^ | $|  /.test(q.text), `${q.id}: лишние пробелы`);
  }
});

test('нет повторов: ни id, ни текстов — внутри категорий и между ними', () => {
  const ids = all().map((q) => q.id);
  const texts = all().map((q) => q.text);
  assert.equal(new Set(ids).size, 120);
  assert.equal(new Set(texts).size, 120);
});

test('у каждого вопроса один верный и два разных ложных ответа', () => {
  for (const q of all()) {
    assert.ok(q.q && q.right, q.id);
    assert.equal(q.wrong.length, 2, q.id);
    assert.equal(new Set([q.right, ...q.wrong]).size, 3, `${q.id}: ответы повторяются`);
  }
  for (const q of CATALOG.story) {
    assert.ok(Number.isInteger(q.year) && q.tale.length > 20, `${q.id}: год и рассказ`);
  }
});

test('верный ответ не длиннее самого длинного ложного (в текстовых категориях)', () => {
  // Правило против подсказки длиной: не угадать ответ по тому, что он самый подробный.
  // В «Слове» ответ выбирают картинкой, подпись не видна — там правило не нужно
  // (и в прототипе не выполняется: «чашка чая», «шапка», «радиоприёмник»).
  for (const c of ['msg', 'riddle', 'story']) {
    for (const q of CATALOG[c]) {
      const longest = Math.max(...q.wrong.map((w) => w.length));
      assert.ok(q.right.length <= longest, `${q.id}: «${q.right}» длиннее ложных`);
    }
  }
});

test('у каждого ответа «Слова» есть картинка — и у верного, и у ложных', () => {
  const need = new Set();
  for (const q of CATALOG.word) for (const n of [q.right, ...q.wrong]) need.add(n);
  for (const n of need) {
    assert.ok(PIC[n], `нет картинки «${n}»`);
    assert.match(picSVG(n, 72), /^<svg[^>]*viewBox="0 0 48 48"[^>]*width="72"/);
  }
  assert.equal(Object.keys(PIC).length, 31);
  // Картинки без внешних классов: заливка задана атрибутами, стили не нужны.
  for (const [n, body] of Object.entries(PIC)) {
    assert.ok(!/class=/.test(body), `«${n}»: класс в картинке`);
    assert.ok(!/<script|on\w+=/i.test(body), `«${n}»: посторонний код`);
  }
  assert.equal(picSVG('нет такого'), '');
  assert.match(ICON.bubble(24), /^<svg class="icon"/);
  assert.match(ICON.exit(24), /^<svg class="icon"/);
});

test('колода: 200 раундов по 5 с обрывами и сохранением — без повторов в круге и раунде', () => {
  for (const cat of CAT_IDS) {
    const ids = idsOf(cat);
    const rnd = seeded(cat.length * 7919 + 1);
    let d = deckFresh();
    let circle = new Set();
    let lastOfCircle = null;
    let circles = 0;
    for (let r = 0; r < 200; r++) {
      const shown = [];
      // Каждый пятый раунд — выход посреди раунда (показано 1–4 вопроса).
      const n = r % 5 === 4 ? 1 + Math.floor(rnd() * 4) : ROUND;
      for (let i = 0; i < n; i++) {
        const before = d.seen.length;
        const prevLast = d.last;
        const id = deckDraw(d, ids, shown, rnd);
        assert.ok(ids.includes(id), 'вопрос из каталога');
        if (d.seen.length <= before) {
          // Начался новый круг.
          assert.equal(circle.size, ids.length, `${cat}: круг кончился раньше, чем выпали все`);
          assert.notEqual(id, prevLast, `${cat}: последний прошлого круга стал первым нового`);
          assert.equal(prevLast, lastOfCircle);
          circle = new Set();
          circles++;
        }
        assert.ok(!circle.has(id), `${cat}: повтор внутри круга`);
        assert.ok(!shown.includes(id), `${cat}: повтор внутри раунда`);
        circle.add(id);
        shown.push(id);
        lastOfCircle = id;
        if (rnd() < 0.5) markSolved(d, id);
      }
      // Между раундами — сохранение и загрузка, как через localStorage.
      d = deckClean(JSON.parse(JSON.stringify(d)), ids);
    }
    assert.ok(circles >= 25, `${cat}: кругов ${circles}`);
    assert.equal(new Set(d.solved).size, d.solved.length);
  }
});

test('колода: круг кончился посреди раунда — показанные в раунде не выпадают снова', () => {
  const ids = idsOf('msg');
  const d = deckFresh();
  d.seen = ids.slice(0, 28);
  d.last = ids[27];
  const shown = [ids[26], ids[27]];
  const rnd = seeded(5);
  const a = deckDraw(d, ids, shown, rnd); shown.push(a);
  const b = deckDraw(d, ids, shown, rnd); shown.push(b);
  assert.deepEqual([a, b].sort(), [ids[28], ids[29]].sort());
  const c = deckDraw(d, ids, shown, rnd);
  assert.ok(!shown.includes(c), 'новый круг не повторяет показанное в этом раунде');
});

test('deckClean: только id каталога, без повторов; last — только из каталога', () => {
  const ids = idsOf('word');
  const d = deckClean({ seen: ['w01', 'w01', 'x99', 5, null, 'w02'], last: 'x99', solved: 'w01' }, ids);
  assert.deepEqual(d, { seen: ['w01', 'w02'], last: null, solved: [] });
  assert.deepEqual(deckClean(null, ids), deckFresh());
  assert.deepEqual(deckClean([1, 2], ids), deckFresh());
  assert.equal(deckClean({ last: 'w05' }, ids).last, 'w05');
});

test('shuffle не теряет и не дублирует варианты', () => {
  const rnd = seeded(11);
  for (let i = 0; i < 50; i++) {
    const a = ['a', 'b', 'c'];
    const s = shuffle(a, rnd);
    assert.deepEqual([...s].sort(), a);
    assert.deepEqual(a, ['a', 'b', 'c'], 'исходный массив не тронут');
  }
});

test('подсчёт «разгадано» по категории и всего', () => {
  const p = puzzleFresh();
  assert.equal(solvedTotal(p), 0);
  markSolved(p.word, 'w01'); markSolved(p.word, 'w01'); markSolved(p.word, 'w02');
  markSolved(p.story, 's01');
  assert.equal(solvedCount(p, 'word'), 2);
  assert.equal(solvedCount(p, 'story'), 1);
  assert.equal(solvedCount(p, 'нет'), 0);
  assert.equal(solvedTotal(p), 3);
  assert.equal(p.isNew, false);
  assert.deepEqual(puzzleClean(p, false), p);
  assert.equal(qById('word', 'w01').right, 'кот');
  assert.equal(qById('word', 'нет'), null);
});

test('закрепка: каталог приложения совпадает с DATA одобренного прототипа', () => {
  const html = readFileSync(new URL('../prototype/chto-peredali.html', import.meta.url), 'utf8');
  const line = html.split('\n').find((l) => l.startsWith('const DATA = '));
  assert.ok(line, 'в прототипе нет строки const DATA');
  const DATA = JSON.parse(line.slice('const DATA = '.length).replace(/;\s*$/, ''));
  assert.deepEqual(Object.keys(DATA), CAT_IDS);
  for (const c of CAT_IDS) {
    assert.equal(CATALOG[c].length, DATA[c].length, c);
    DATA[c].forEach((p, i) => {
      const q = CATALOG[c][i];
      const pick = (o) => ({ id: o.id, text: o.text, q: o.q, right: o.right, wrong: o.wrong,
        year: o.year, tale: o.tale });
      assert.deepEqual(pick(q), pick(p), `${c} ${p.id}`);
    });
  }
  // Источники и пометка «спорно» в приложение не переносятся.
  for (const q of all()) {
    assert.equal(q.links, undefined, q.id);
    assert.equal(q.srcHtml, undefined, q.id);
    assert.equal(q.disputed, undefined, q.id);
  }
  // Картинки тоже те же, что в прототипе (с заменой class="f" на заливку атрибутом).
  const block = html.match(/const PICS = \{\n([\s\S]*?)\n\};/)[1];
  const pics = Object.fromEntries([...block.matchAll(/^\s*'([^']+)': '([^']*)',?$/gm)]
    .map((m) => [m[1], m[2].replace(/ class="f"/g, ' fill="currentColor" stroke="none"')]));
  assert.deepEqual(PIC, pics);
});
