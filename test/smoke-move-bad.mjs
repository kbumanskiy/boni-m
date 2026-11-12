// Новый адрес, во фрагменте битая строка (ТЗ-переезд.md, 7.2).
import { boot, NEW } from './move-harness.mjs';

const T = await boot({ url: `${NEW}#perenos=M73.1.z.20261018.00000000.AAAA`, name: 'smoke-move-bad' });
T.ok(T.window.location.hash === '', 'фрагмент стёрт');
T.ok(T.$('#mv-err') && T.$('#mv-err').textContent === 'Код скопировался не целиком. Скопируйте его ещё раз.', 'текст ошибки простыми словами');
T.ok(T.$('#mv-b1') && T.$('#mv-b1').textContent === 'Перенести кодом', 'есть «Перенести кодом»');
T.ok(T.store('boni_m_state') === null, 'хранилище пусто');
T.click('#mv-b0'); await T.sleep(20);
T.ok(T.text().includes('Как вас зовут'), '«Продолжить» → знакомство');
T.ok(T.store('boni_m_state') === null && T.store('boni_m_import_at') === null, 'хранилище по-прежнему пусто');
T.ok(T.restarts === 0, 'перезапуска нет');
T.finish();
