import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateEnquiry, looksLikeBot } from './validate.js';

const valid = {
  name: 'Jordan Ellis',
  email: 'jordan@example.com',
  phone: '03 9432 1044',
  sector: 'retail',
  message: 'We need a full fitout for a new cafe tenancy in Preston.',
};

test('accepts a well-formed enquiry', () => {
  const result = validateEnquiry(valid);
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'Jordan Ellis');
  assert.equal(result.data.email, 'jordan@example.com');
});

test('lowercases the email and trims whitespace', () => {
  const result = validateEnquiry({ ...valid, email: '  Jordan@Example.COM  ', name: '  Jordan  ' });
  assert.equal(result.ok, true);
  assert.equal(result.data.email, 'jordan@example.com');
  assert.equal(result.data.name, 'Jordan');
});

test('treats optional fields as null when blank', () => {
  const result = validateEnquiry({ ...valid, phone: '', sector: '' });
  assert.equal(result.ok, true);
  assert.equal(result.data.phone, null);
  assert.equal(result.data.sector, null);
});

test('rejects a missing name', () => {
  const result = validateEnquiry({ ...valid, name: '' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.name);
});

test('rejects malformed emails', () => {
  for (const email of ['nope', 'a@b', 'a b@c.com', '@example.com', 'x@.com']) {
    const result = validateEnquiry({ ...valid, email });
    assert.equal(result.ok, false, `expected ${email} to fail`);
    assert.ok(result.errors.email);
  }
});

test('rejects a too-short message', () => {
  const result = validateEnquiry({ ...valid, message: 'hi' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.message);
});

test('rejects an over-long message', () => {
  const result = validateEnquiry({ ...valid, message: 'x'.repeat(2001) });
  assert.equal(result.ok, false);
  assert.ok(result.errors.message);
});

test('rejects a phone number with too few digits', () => {
  const result = validateEnquiry({ ...valid, phone: '123' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.phone);
});

test('rejects an unknown sector', () => {
  const result = validateEnquiry({ ...valid, sector: 'aerospace' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.sector);
});

test('rejects non-object bodies', () => {
  for (const body of [null, 'string', 42, []]) {
    assert.equal(validateEnquiry(body).ok, false);
  }
});

test('strips control characters rather than storing them', () => {
  const result = validateEnquiry({ ...valid, name: 'Jo\u0000rdan' });
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'Jordan');
});

test('keeps newlines inside the message', () => {
  const result = validateEnquiry({ ...valid, message: 'Line one\nLine two, plenty long enough.' });
  assert.equal(result.ok, true);
  assert.ok(result.data.message.includes('\n'));
});

test('flags a filled honeypot', () => {
  assert.equal(looksLikeBot({ company_website: 'http://spam.example' }), true);
  assert.equal(looksLikeBot({ company_website: '' }), false);
  assert.equal(looksLikeBot({}), false);
});
