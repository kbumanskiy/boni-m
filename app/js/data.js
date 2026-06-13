// Таблицы Морзе и порядок обучения — единственный источник правды.
// Транскрибировано из ТЗ §3 и §6. Коды сверены с ITU M.1677 / Википедией.
// МЕНЯТЬ КОДЫ НЕЛЬЗЯ без сверки — неверная точка/тире = пользователь выучит не ту букву.

// Точка = '.', тире = '-'.

// §3.1 Русский алфавит (32 кода на 33 буквы; Е и Ё — один код).
// { char, code, latin, chant }
export const RU_LETTERS = [
  { char: 'А', code: '.-',    latin: 'A', chant: 'ай-даа' },
  { char: 'Б', code: '-...',  latin: 'B', chant: 'баа-ки-те-кут' },
  { char: 'В', code: '.--',   latin: 'W', chant: 'ви-даа-лаа' },
  { char: 'Г', code: '--.',   latin: 'G', chant: 'гаа-раа-жи' },
  { char: 'Д', code: '-..',   latin: 'D', chant: 'доо-ми-ки' },
  { char: 'Е', code: '.',     latin: 'E', chant: 'есть' },        // Е и Ё — один код
  { char: 'Ж', code: '...-',  latin: 'V', chant: 'же-ле-зис-тоо' },
  { char: 'З', code: '--..',  latin: 'Z', chant: 'заа-каа-ти-ки' },
  { char: 'И', code: '..',    latin: 'I', chant: 'и-ди' },
  { char: 'Й', code: '.---',  latin: 'J', chant: 'йас-наа-паа-раа' },
  { char: 'К', code: '-.-',   latin: 'K', chant: 'каак-же-таак' },
  { char: 'Л', code: '.-..',  latin: 'L', chant: 'лу-наа-ти-ки' },
  { char: 'М', code: '--',    latin: 'M', chant: 'маа-маа' },
  { char: 'Н', code: '-.',    latin: 'N', chant: 'ноо-мер' },
  { char: 'О', code: '---',   latin: 'O', chant: 'оо-коо-лоо' },
  { char: 'П', code: '.--.',  latin: 'P', chant: 'пи-лаа-поо-ёт' },
  { char: 'Р', code: '.-.',   latin: 'R', chant: 'ре-шаа-ет' },
  { char: 'С', code: '...',   latin: 'S', chant: 'си-ни-е' },
  { char: 'Т', code: '-',     latin: 'T', chant: 'таак' },
  { char: 'У', code: '..-',   latin: 'U', chant: 'у-нес-лоо' },
  { char: 'Ф', code: '..-.',  latin: 'F', chant: 'фи-ли-моон-чик' },
  { char: 'Х', code: '....',  latin: 'H', chant: 'хи-ми-чи-те' },
  { char: 'Ц', code: '-.-.',  latin: 'C', chant: 'цаа-пли-наа-ши' },
  { char: 'Ч', code: '---.',  latin: '',  chant: 'чаа-шаа-тоо-нет' },
  { char: 'Ш', code: '----',  latin: '',  chant: 'шаа-роо-ваа-рыы' },
  { char: 'Щ', code: '--.-',  latin: 'Q', chant: 'щаа-ваам-не-шаа' },
  { char: 'Ъ', code: '--.--', latin: '',  chant: 'твёёр-дыый-не-мяяг-киий' },
  { char: 'Ы', code: '-.--',  latin: 'Y', chant: 'ыы-не-наа-доо' },
  { char: 'Ь', code: '-..-',  latin: 'X', chant: 'тоо-мяг-кий-знаак' },
  { char: 'Э', code: '..-..', latin: '',  chant: 'э-ле-роо-ни-ки' },
  { char: 'Ю', code: '..--',  latin: '',  chant: 'ю-ли-аа-наа' },
  { char: 'Я', code: '.-.-',  latin: '',  chant: 'я-маал-я-маал' },
];

// §3.2 Цифры (одинаковы для ru и en).
export const DIGITS = [
  { char: '1', code: '.----', chant: 'и-тооль-коо-оо-днаа' },
  { char: '2', code: '..---', chant: 'две-не-хоо-роо-шоо' },
  { char: '3', code: '...--', chant: 'три-те-бе-маа-лоо' },
  { char: '4', code: '....-', chant: 'че-тве-ри-те-каа' },
  { char: '5', code: '.....', chant: 'пя-ти-ле-ти-е' },
  { char: '6', code: '-....', chant: 'поо-шес-ти-бе-ри' },
  { char: '7', code: '--...', chant: 'даа-даа-се-ме-ри' },
  { char: '8', code: '---..', chant: 'воо-сьмоо-гоо-и-ди' },
  { char: '9', code: '----.', chant: 'ноо-наа-ноо-наа-ми' },
  { char: '0', code: '-----', chant: 'нооль-тоо-оо-коо-лоо' },
];

// §3.3 Латинский алфавит (международный, ITU).
export const EN_LETTERS = [
  { char: 'A', code: '.-' },   { char: 'B', code: '-...' }, { char: 'C', code: '-.-.' },
  { char: 'D', code: '-..' },  { char: 'E', code: '.' },    { char: 'F', code: '..-.' },
  { char: 'G', code: '--.' },  { char: 'H', code: '....' }, { char: 'I', code: '..' },
  { char: 'J', code: '.---' }, { char: 'K', code: '-.-' },  { char: 'L', code: '.-..' },
  { char: 'M', code: '--' },   { char: 'N', code: '-.' },   { char: 'O', code: '---' },
  { char: 'P', code: '.--.' }, { char: 'Q', code: '--.-' }, { char: 'R', code: '.-.' },
  { char: 'S', code: '...' },  { char: 'T', code: '-' },    { char: 'U', code: '..-' },
  { char: 'V', code: '...-' }, { char: 'W', code: '.--' },  { char: 'X', code: '-..-' },
  { char: 'Y', code: '-.--' }, { char: 'Z', code: '--..' },
];

// §3.4 Знаки препинания (раздел «Дополнительно», не в основном обучении).
// Коды приведены к международному стандарту ITU M.1677 (решение Кости: знания должны
// соответствовать признанным стандартам). Три кода поправлены против ТЗ — Точка, Запятая,
// Восклицание — остальные совпадали с ТЗ изначально.
export const PUNCTUATION = [
  { char: '.', name: 'Точка',        code: '.-.-.-' },   // поправлено по ITU (в ТЗ было ......)
  { char: ',', name: 'Запятая',      code: '--..--' },   // поправлено по ITU (в ТЗ было .-.-.-)
  { char: ':', name: 'Двоеточие',    code: '---...' },
  { char: '?', name: 'Вопрос',       code: '..--..' },
  { char: '!', name: 'Восклицание',  code: '-.-.--' },   // поправлено по ITU (в ТЗ было --..--)
  { char: '/', name: 'Дробь',        code: '-..-.' },
  { char: ')', name: 'Скобка',       code: '-.--.-' },
  { char: '"', name: 'Кавычки',      code: '.-..-.' },
  { char: '-', name: 'Тире',         code: '-....-' },
  { char: '=', name: 'Знак раздела', code: '-...-' },
  { char: '✗', name: 'Ошибка',       code: '........' },
  { char: '@', name: '@',            code: '.--.-.' },
];

// §6 Порядок открытия знаков (первые 4 открыты сразу).
export const KOCH_ORDER_RU = ['Е','Т','И','М','А','Н','С','О','У','К','Р','В','Д','Л','П','Г','З','Б','Й','Ь','Ы','Я','Ч','Х','Ж','Ц','Ф','Ю','Ш','Щ','Э','Ъ'];
export const KOCH_ORDER_EN = ['K','M','R','S','U','A','P','T','L','O','W','I','N','J','E','F','Y','V','G','Q','Z','H','B','C','D','X'];
export const DIGIT_ORDER   = ['0','1','2','3','4','5','6','7','8','9'];

export const START_SET_SIZE = 4; // §6: стартовый набор — первые 4 знака сразу.

// §9: позывной «Boney M» = коды B,O,N,E,Y,M. Те же коды в русском: Б,О,Н,Е,Ы,М.
// По решению Кости спецдрилл привязан к русскому треку (доступен после освоения Ы).
export const CALLSIGN = 'Boney M';
export const CALLSIGN_RU_CHARS = ['Б','О','Н','Е','Ы','М']; // эти коды должны быть освоены
export const CALLSIGN_CODES = ['-...', '---', '-.', '.', '-.--', '--'];

// §9: радиолюбительские «слова» для тренировки в латинском режиме.
export const HAM_WORDS_EN = ['QTH', 'QRZ', 'QSO', '73', 'CQ'];

// Удобные индексы: символ -> код, по алфавиту.
function buildMap(list) {
  const m = new Map();
  for (const item of list) m.set(item.char, item.code);
  return m;
}
export const CODE_BY_CHAR = {
  ru: buildMap([...RU_LETTERS, ...DIGITS]),
  en: buildMap([...EN_LETTERS, ...DIGITS]),
};

// Метаданные знака по символу (для напевов и латинского аналога).
export function charInfo(ch) {
  return RU_LETTERS.find((x) => x.char === ch)
    || DIGITS.find((x) => x.char === ch)
    || EN_LETTERS.find((x) => x.char === ch)
    || PUNCTUATION.find((x) => x.char === ch)
    || null;
}
