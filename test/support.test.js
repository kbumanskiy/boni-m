// Внешние адреса и проверка письма обратной связи.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  externalUrl, donateUrl, feedbackUrl, validateFeedback,
  DONATE_URL, FEEDBACK_URL, MESSAGE_MAX, CONTACT_MAX,
} from '../app/js/support.js';

test('пустой адрес не даёт ссылки — блок не должен появиться', () => {
  assert.equal(externalUrl(''), null);
  assert.equal(externalUrl('   '), null);
  assert.equal(externalUrl(null), null);
  assert.equal(externalUrl(undefined), null);
});

test('http отвергается: страница открыта по https, и такой запрос браузер заблокирует', () => {
  assert.equal(externalUrl('http://example.org/feedback'), null);
});

test('опасные схемы отвергаются', () => {
  assert.equal(externalUrl('javascript:alert(1)'), null);
  assert.equal(externalUrl('data:text/html,<script>'), null);
  assert.equal(externalUrl('//example.org'), null);
});

test('нормальный https-адрес принимается и обрезается по краям', () => {
  assert.equal(externalUrl('  https://boosty.to/morse73  '), 'https://boosty.to/morse73');
});

test('адрес с пробелом внутри отвергается — это не адрес, а склейка', () => {
  assert.equal(externalUrl('https://example.org/a b'), null);
});

test('в поставке адреса пустые: приложение выкладывается без мёртвых кнопок', () => {
  assert.equal(DONATE_URL, '');
  assert.equal(FEEDBACK_URL, '');
  assert.equal(donateUrl(), null);
  assert.equal(feedbackUrl(), null);
});

test('письмо без текста не отправляется', () => {
  const r = validateFeedback({ message: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /пустое/);
});

test('текст письма обрезается по краям и доходит целым', () => {
  const r = validateFeedback({ message: '  здравствуйте, Боня  ', contact: ' @kostya ' });
  assert.equal(r.ok, true);
  assert.equal(r.message, 'здравствуйте, Боня');
  assert.equal(r.contact, '@kostya');
});

test('контакт необязателен', () => {
  const r = validateFeedback({ message: 'спасибо!' });
  assert.equal(r.ok, true);
  assert.equal(r.contact, '');
});

test('слишком длинное письмо отклоняется с понятным текстом', () => {
  const r = validateFeedback({ message: 'а'.repeat(MESSAGE_MAX + 1) });
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(String(MESSAGE_MAX)));
});

test('письмо ровно по пределу принимается', () => {
  assert.equal(validateFeedback({ message: 'а'.repeat(MESSAGE_MAX) }).ok, true);
});

test('слишком длинный контакт отклоняется', () => {
  const r = validateFeedback({ message: 'привет', contact: 'к'.repeat(CONTACT_MAX + 1) });
  assert.equal(r.ok, false);
});

test('вызов без аргументов вообще не роняет проверку', () => {
  assert.equal(validateFeedback().ok, false);
});
