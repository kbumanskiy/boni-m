// Старый адрес, пустое хранилище, MOVE_HOME = true: на знакомстве строка «Приложение переехало» (ТЗ-переезд.md, 7.2).
import { boot, OLD } from './move-harness.mjs';

const T = await boot({ url: OLD, move: { MOVE_HOME: true }, name: 'smoke-move-old-fresh' });
T.ok(T.text().includes('Как вас зовут'), 'знакомство открыто');
T.ok(T.$('#move-card') && T.$('#move-card').textContent.includes('Приложение переехало на app.morse73.ru'), 'на знакомстве строка «Приложение переехало на app.morse73.ru»');
T.ok(T.$('#m-open').textContent === 'Открыть новый адрес' && T.$('#m-open').getAttribute('href') === 'https://app.morse73.ru/', '«Открыть новый адрес» — без #perenos');
T.ok(!T.$('#m-go') && !T.$('#m-copy'), 'переносить нечего: кнопок переноса нет');
T.ok(!T.$('#m-have'), 'приёма на старом адресе нет');
// Знакомство проходится как прежде.
T.$('#name').value = 'Вася'; T.fire(T.$('#name'), 'input');
T.click('#next'); await T.sleep(10);
T.ok(T.text().includes('Рады знакомству, Вася'), 'шаг 2 знакомства');
T.click('#start'); await T.sleep(30);
T.ok(T.$$('#opts .opt').length === 4, '«Начать занятие» открывает занятие');
T.click('[data-tab="home"]'); await T.sleep(20);
// После «Начать занятие» записана веха «первые 4 знака» и 10 очков — по isEmptyProgress это уже
// не пусто, и карточка предлагает перенести (безвредно: переносится то, что есть).
T.ok(T.$('#move-card') && !T.$('#m-have'), 'на главной после первых шагов — обычная карточка переезда');
T.finish();
