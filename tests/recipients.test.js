import { describe, it, expect } from 'vitest';
import { isValidEmail, normalizeRecipients } from '../server/recipients.js';

describe('isValidEmail', () => {
  it('accepts plausible addresses', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('First.Last+tag@sub.example.co')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});

describe('getEffectiveRecipients / env fallback behavior (pure logic, no Blobs)', () => {
  it('normalizeRecipients output is what send-email.js and email-config.js both validate against', () => {
    // send-email.js does `recipients.filter((r) => !allowed.includes(r))`
    // against getEffectiveRecipients() output -- confirm a case-varied or
    // whitespace-padded input would NOT match the normalized stored form,
    // i.e. the frontend must submit exactly the normalized strings it was
    // given by email-config.js/recipients.js, not something re-typed.
    const stored = normalizeRecipients(['Test@Example.com']);
    expect(stored).toEqual(['test@example.com']);
    const submittedFromUI = stored; // what the checkbox UI would submit back
    const allowed = stored;
    const invalid = submittedFromUI.filter((r) => !allowed.includes(r));
    expect(invalid).toEqual([]);

    const tampered = ['Test@Example.com']; // un-normalized, as if bypassing the UI
    const invalidTampered = tampered.filter((r) => !allowed.includes(r));
    expect(invalidTampered).toEqual(['Test@Example.com']);
  });
});

describe('normalizeRecipients', () => {
  it('trims, lowercases, and dedupes', () => {
    const result = normalizeRecipients([' A@B.com ', 'a@b.com', 'C@D.com']);
    expect(result).toEqual(['a@b.com', 'c@d.com']);
  });

  it('drops invalid entries without throwing', () => {
    const result = normalizeRecipients(['good@example.com', 'not-an-email', '', 'also-good@example.com']);
    expect(result).toEqual(['good@example.com', 'also-good@example.com']);
  });

  it('returns an empty array for an all-invalid input', () => {
    expect(normalizeRecipients(['nope', ''])).toEqual([]);
  });
});
