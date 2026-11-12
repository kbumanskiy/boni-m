// Путь айфона: новый адрес без фрагмента, пустое хранилище; знакомство → «У меня уже есть прогресс…»
// → поле → код (ТЗ-переезд.md, 7.2).
import { boot, NEW, codeFor, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const code = await codeFor(snap);
let clip = '';
const T = await boot({ url: NEW, name: 'smoke-move-paste', nav: { clipboard: { readText: async () => clip } } });

T.ok(T.text().includes('Как вас зовут'), 'без фрагмента — обычное знакомство');
T.ok(T.$('#m-have') && T.$('#m-have').textContent === 'У меня уже есть прогресс в старом приложении', 'есть «У меня уже есть прогресс в старом приложении»');
T.ok(T.$('#m-have').classList.contains('linkbtn'), 'это linkbtn, под «Дальше»');
T.click('#m-have'); await T.sleep(10);
T.ok(T.$('#m-code') && T.text().includes('Перенос кодом'), 'экран вставки: поле и заголовок');
T.ok(T.$('#m-paste') && T.$('#m-check') && T.$('#m-back'), 'кнопки «Вставить из буфера», «Проверить код», «Назад»');

// Пусто и не код.
T.click('#m-check'); await T.sleep(20);
T.ok(T.$('#m-err').textContent === 'Поле пустое. Вставьте код из старого приложения.', 'пустое поле — своя ошибка');
T.$('#m-code').value = 'привет'; T.click('#m-check'); await T.sleep(20);
T.ok(T.$('#m-err').textContent.startsWith('Это не код переноса.'), 'не код — своя ошибка');

// Испорченный код.
const broken = code.slice(0, code.length - 60);
T.$('#m-code').value = broken; T.click('#m-check'); await T.sleep(20);
T.ok(T.$('#m-err').textContent === 'Код скопировался не целиком. Скопируйте его ещё раз.', 'испорченный код — «скопировался не целиком»');
T.ok(T.store('boni_m_state') === null, 'хранилище пусто');
// «Назад» → знакомство.
T.click('#m-back'); await T.sleep(10);
T.ok(T.text().includes('Как вас зовут'), '«Назад» → знакомство');
T.ok(T.store('boni_m_state') === null, 'после «Назад» хранилище пусто');

// «Вставить из буфера».
T.click('#m-have'); await T.sleep(10);
clip = code;
T.click('#m-paste'); await T.sleep(10);
T.ok(T.$('#m-code').value === code, '«Вставить из буфера» кладёт код в поле');

// Код с переносами строк каждые 60 знаков → подтверждение → «Да».
T.$('#m-code').value = code.replace(/(.{60})/g, '$1\n');
T.click('#m-check'); await T.sleep(30);
T.ok(T.$('#mv-confirm') && T.text().includes('Перенести ваш прогресс?'), 'код с переносами строк → подтверждение');
T.ok(T.store('boni_m_state') === null, 'до «Да» хранилище пусто');
// «Отмена» из кода → обратно к полю.
T.click('#mv-no'); await T.sleep(10);
T.ok(T.$('#m-code'), '«Отмена» после кода → снова поле вставки');
T.$('#m-code').value = `Вот: ${code} спасибо`; T.click('#m-check'); await T.sleep(30);
T.click('#mv-yes'); await T.sleep(20);
T.eq(T.saved(), snap, 'после «Да» состояние верное');
T.ok(T.restarts === 1, 'перезапуск вызван один раз');
T.ok(T.window.sessionStorage.getItem('boni_m_moved_ok') === '1', 'флаг «Готово» записан');
T.ok(!T.consoleSeen.some((l) => l.includes('M73' + '.')), 'код переноса в консоль не попал');
T.ok(T.dialogs.length === 0, 'ни одного окна confirm/alert/prompt');
T.finish();
