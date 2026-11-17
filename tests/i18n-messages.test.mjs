import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeMessages } from '../src/i18n/messages.js';

test('mergeMessages: overlay wins, missing keys fall back to base', () => {
  const base = { Meta: { title: 'T', description: 'D' }, Cart: { empty: 'Empty' } };
  assert.deepEqual(mergeMessages(base, { Meta: { title: 'Т' } }), {
    Meta: { title: 'Т', description: 'D' },
    Cart: { empty: 'Empty' },
  });
});
test('mergeMessages: blank strings fall back to base', () =>
  assert.deepEqual(mergeMessages({ A: { b: 'x' } }, { A: { b: '  ' } }), { A: { b: 'x' } }));
test('mergeMessages: does not mutate base', () => {
  const base = { A: { b: 'x' } };
  mergeMessages(base, { A: { b: 'y' } });
  assert.deepEqual(base, { A: { b: 'x' } });
});
test('message files share the Meta namespace', () => {
  for (const locale of ['en', 'ru', 'kk']) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'));
    assert.equal(typeof messages.Meta.title, 'string', locale);
    assert.equal(typeof messages.Meta.description, 'string', locale);
  }
});
