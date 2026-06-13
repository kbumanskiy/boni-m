// Тест №1 (важнейший): сверка таблиц Морзе с независимым эталоном.
// Неверная точка/тире = пользователь выучит не ту букву. Это худший возможный баг.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RU_LETTERS, EN_LETTERS, DIGITS, PUNCTUATION,
  KOCH_ORDER_RU, KOCH_ORDER_EN, DIGIT_ORDER,
  CALLSIGN_RU_CHARS, CALLSIGN_CODES, CODE_BY_CHAR,
} from '../app/js/data.js';

// Независимый эталон (ITU M.1677 / стандарт). Набран отдельно от data.js.
const REF_RU = {
  'А':'.-','Б':'-...','В':'.--','Г':'--.','Д':'-..','Е':'.','Ж':'...-','З':'--..',
  'И':'..','Й':'.---','К':'-.-','Л':'.-..','М':'--','Н':'-.','О':'---','П':'.--.',
  'Р':'.-.','С':'...','Т':'-','У':'..-','Ф':'..-.','Х':'....','Ц':'-.-.','Ч':'---.',
  'Ш':'----','Щ':'--.-','Ъ':'--.--','Ы':'-.--','Ь':'-..-','Э':'..-..','Ю':'..--','Я':'.-.-',
};
const REF_EN = {
  'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....',
  'I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.',
  'Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-',
  'Y':'-.--','Z':'--..',
};
const REF_DIGITS = {
  '1':'.----','2':'..---','3':'...--','4':'....-','5':'.....',
  '6':'-....','7':'--...','8':'---..','9':'----.','0':'-----',
};

test('русские буквы: коды совпадают с эталоном', () => {
  assert.equal(RU_LETTERS.length, 32, '32 кода на 33 буквы (Е=Ё)');
  for (const { char, code } of RU_LETTERS) {
    assert.equal(code, REF_RU[char], `Русская «${char}» должна быть ${REF_RU[char]}, а в data.js ${code}`);
  }
});

test('латинские буквы: коды совпадают с эталоном', () => {
  assert.equal(EN_LETTERS.length, 26);
  for (const { char, code } of EN_LETTERS) {
    assert.equal(code, REF_EN[char], `Латинская «${char}» должна быть ${REF_EN[char]}`);
  }
});

test('цифры: коды совпадают с эталоном', () => {
  assert.equal(DIGITS.length, 10);
  for (const { char, code } of DIGITS) {
    assert.equal(code, REF_DIGITS[char], `Цифра «${char}» должна быть ${REF_DIGITS[char]}`);
  }
});

test('знаки препинания: коды совпадают с международным стандартом ITU M.1677', () => {
  // Эталон ITU M.1677. Набран независимо от data.js.
  const REF_PUNCT = {
    'Точка': '.-.-.-', 'Запятая': '--..--', 'Двоеточие': '---...', 'Вопрос': '..--..',
    'Восклицание': '-.-.--', 'Дробь': '-..-.', 'Скобка': '-.--.-', 'Кавычки': '.-..-.',
    'Тире': '-....-', 'Знак раздела': '-...-', 'Ошибка': '........', '@': '.--.-.',
  };
  for (const { name, code } of PUNCTUATION) {
    assert.equal(code, REF_PUNCT[name], `«${name}» по ITU должно быть ${REF_PUNCT[name]}, а в data.js ${code}`);
  }
});

test('коды состоят только из точек и тире и непустые', () => {
  for (const list of [RU_LETTERS, EN_LETTERS, DIGITS, PUNCTUATION]) {
    for (const { char, code } of list) {
      assert.match(code, /^[.-]+$/, `Код «${char}» содержит лишние символы: ${code}`);
    }
  }
});

test('порядок Коха — это перестановка алфавита без повторов и пропусков', () => {
  assert.equal(KOCH_ORDER_RU.length, 32);
  assert.equal(new Set(KOCH_ORDER_RU).size, 32, 'нет повторов в русском порядке');
  assert.deepEqual(new Set(KOCH_ORDER_RU), new Set(RU_LETTERS.map(x => x.char)));

  assert.equal(KOCH_ORDER_EN.length, 26);
  assert.equal(new Set(KOCH_ORDER_EN).size, 26, 'нет повторов в латинском порядке');
  assert.deepEqual(new Set(KOCH_ORDER_EN), new Set(EN_LETTERS.map(x => x.char)));

  assert.deepEqual(new Set(DIGIT_ORDER), new Set(DIGITS.map(x => x.char)));
});

test('позывной Boney M: русские коды Б,О,Н,Е,Ы,М совпадают с латинскими B,O,N,E,Y,M', () => {
  // Это и есть обоснование привязки спецдрилла к русскому треку.
  assert.deepEqual(CALLSIGN_RU_CHARS, ['Б','О','Н','Е','Ы','М']);
  const fromRu = CALLSIGN_RU_CHARS.map(c => CODE_BY_CHAR.ru.get(c));
  assert.deepEqual(fromRu, CALLSIGN_CODES, 'коды русских букв позывного');
  const enChars = ['B','O','N','E','Y','M'];
  const fromEn = enChars.map(c => CODE_BY_CHAR.en.get(c));
  assert.deepEqual(fromEn, CALLSIGN_CODES, 'те же коды у латинских букв — звук позывного одинаков');
});

test('Ы открывается достаточно рано в русском порядке (позывной достижим)', () => {
  // Последний нужный для позывного знак — Ы. Проверяем, что он не в самом конце.
  const idxY = KOCH_ORDER_RU.indexOf('Ы');
  for (const ch of CALLSIGN_RU_CHARS) {
    assert.ok(KOCH_ORDER_RU.indexOf(ch) <= idxY, `${ch} открывается не позже Ы`);
  }
  assert.ok(idxY < 24, `Ы на позиции ${idxY + 1} из 32 — достижимо без английского`);
});
