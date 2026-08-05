// Внешние адреса приложения: поддержать проект и написать автору.
// Единственное место, где их нужно менять.
//
// Пока адрес пуст — соответствующий блок В ПРИЛОЖЕНИИ НЕ ПОЯВЛЯЕТСЯ ВООБЩЕ.
// Это важно: приложение обновляется само, и мёртвая кнопка на телефоне папы
// выглядела бы поломкой, а не «пока не настроено».

// Куда ведёт кнопка «Поддержать». Cloudtips — российские карты и СБП проходят.
export const DONATE_URL = 'https://pay.cloudtips.ru/p/6f4f40f4';

// Куда форма обратной связи отправляет письмо. Это приёмник на сервере, а НЕ телеграм:
// токен бота в приложении держать нельзя — файлы приложения открыты каждому, кто его
// скачал, и токен увели бы за часы. Приёмник хранит токен у себя.
// Пример: https://morse73.example.org/feedback
export const FEEDBACK_URL = '';

// Ограничения письма. Проверяются и здесь, и на сервере: браузеру верить нельзя,
// а пользователю нужно сказать про предел до отправки, а не после.
export const MESSAGE_MAX = 2000;
export const CONTACT_MAX = 100;

// Внешний адрес принимаем только по https. Причина не в педантизме: страница сайта
// открыта по https, и запрос на http браузер молча заблокирует — кнопка будет
// «нажиматься», ничего не отправляя. Лучше не показать её вовсе.
export function externalUrl(url) {
  const s = String(url == null ? '' : url).trim();
  return /^https:\/\/[^\s<>"']+$/i.test(s) ? s : null;
}

export function donateUrl(url = DONATE_URL) {
  return externalUrl(url);
}

export function feedbackUrl(url = FEEDBACK_URL) {
  return externalUrl(url);
}

// Готово ли письмо к отправке. Возвращает { ok, error } — текст ошибки показываем
// человеку как есть, поэтому он написан по-русски и без упрёка.
export function validateFeedback({ message = '', contact = '' } = {}) {
  const text = String(message).trim();
  const who = String(contact).trim();
  if (!text) return { ok: false, error: 'Напишите сообщение — пока поле пустое.' };
  if (text.length > MESSAGE_MAX) {
    return { ok: false, error: `Сообщение длиннее ${MESSAGE_MAX} знаков — сократите, пожалуйста.` };
  }
  if (who.length > CONTACT_MAX) {
    return { ok: false, error: `Контакт длиннее ${CONTACT_MAX} знаков.` };
  }
  return { ok: true, message: text, contact: who };
}
