import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_PATTERN_LENGTH, safeRegExp } from './regex-safety.js';

/** Patterns that make a backtracking engine take exponential or huge time on `aaaa…!`. */
const HOSTILE = [
  '(a+)+$',
  '(a*)*$',
  '(a|a)*$',
  '(a|ab)+c',
  '^(\\w+\\s?)*$',
  '(x+x+)+y',
  '(.*a){20}',
  '(a{1,40}){1,40}',
  '((a+))+b',
  '(?:a+)+b',
  '(?<word>a+)+b',
  '(a)\\1',
  '(?<n>a)\\k<n>',
  '(?<=a)b',
];

/** Patterns a designer really writes. */
const ORDINARY = [
  '^[a-z][a-zA-Z0-9_]{0,63}$',
  '^\\d{4}-\\d{2}-\\d{2}$',
  '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
  '^(?:FR|BE)\\d{2}$',
  '^(\\+33|0)[1-9](\\d{2}){4}$',
  '^[A-Z]{2,3}-\\d+$',
  '^(?:[A-Z]|\\d)+$',
  '^\\(?\\d+\\)?$',
  '^[a-z\\]]+$',
];

describe('safeRegExp', () => {
  it.each(HOSTILE)('refuses %s', (pattern) => {
    const result = safeRegExp(pattern);
    expect(result.ok).toBe(false);
  });

  it.each(ORDINARY)('accepts %s', (pattern) => {
    const result = safeRegExp(pattern);
    expect(result.ok, pattern).toBe(true);
  });

  it('refuses a pattern that does not compile, is unbalanced, or is too long', () => {
    for (const pattern of ['(', 'a)', '[a-', '*a', 'a{2,1}']) {
      expect(safeRegExp(pattern).ok, pattern).toBe(false);
    }
    expect(safeRegExp('a'.repeat(MAX_PATTERN_LENGTH)).ok).toBe(true);
    expect(safeRegExp('a'.repeat(MAX_PATTERN_LENGTH + 1)).ok).toBe(false);
  });

  it('says why', () => {
    const result = safeRegExp('(a+)+$');
    expect(result.ok ? '' : result.error).toMatch(/repeat inside a repeat/);
  });

  it('what it accepts stays fast on a hostile input of the longest length of a string field', () => {
    const hostile = `${'a'.repeat(254)}!`;
    const started = performance.now();
    for (const pattern of ORDINARY) {
      const result = safeRegExp(pattern);
      if (result.ok) result.value.test(hostile);
    }
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('never throws, whatever the text (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (pattern) => {
        expect(typeof safeRegExp(pattern).ok).toBe('boolean');
      }),
      { numRuns: 2000 },
    );
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('(', ')', '|', '+', '*', '?', '{2,}', 'a', '\\1', '[a]'), {
          maxLength: 30,
        }),
        (parts) => {
          expect(typeof safeRegExp(parts.join('')).ok).toBe('boolean');
        },
      ),
      { numRuns: 3000 },
    );
  });
});
