// Новый адрес, iPhone в Safari без значка: «Готово» говорит другое (ТЗ-переезд.md, 4.4).
import { boot, NEW, snapshot } from './move-harness.mjs';

const snap = await snapshot();
const T = await boot({
  url: NEW, store: { boni_m_state: JSON.stringify(snap) }, session: { boni_m_moved_ok: '1' }, name: 'smoke-move-done-ios',
  nav: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' },
});
T.ok(T.$('#m-done') && T.$('#m-done').textContent.includes('Готово, прогресс перенесён в Safari'), 'заголовок «Готово, прогресс перенесён в Safari»');
T.ok(T.text().includes('У меня уже есть прогресс в старом приложении') && T.text().includes('На экран «Домой»'), 'сказано про значок и код со старого адреса');
T.ok(!T.$('#m-install'), 'кнопки установки нет');
T.finish();
