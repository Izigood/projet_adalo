import { describe, expect, it } from 'vitest';
import { andThen, domainError, err, map, ok, unwrapOr } from './index.js';
import type { Result } from './index.js';

const parsePositive = (n: number): Result<number> =>
  n > 0 ? ok(n) : err(domainError('CONSTRAINT_VIOLATION', 'must be positive'));

describe('Result', () => {
  it('ok carries the value and err carries the error', () => {
    const success = parsePositive(2);
    const failure = parsePositive(-1);
    expect(success).toEqual({ ok: true, value: 2 });
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.error.code).toBe('CONSTRAINT_VIOLATION');
  });

  it('map transforms only successes', () => {
    expect(map(parsePositive(2), (n) => n * 10)).toEqual({ ok: true, value: 20 });
    const failure = map(parsePositive(-1), (n) => n * 10);
    expect(failure.ok).toBe(false);
  });

  it('andThen short-circuits on the first error', () => {
    const chained = andThen(parsePositive(-1), (n) => parsePositive(n - 1));
    expect(chained.ok).toBe(false);
    expect(andThen(parsePositive(3), (n) => parsePositive(n - 1))).toEqual({ ok: true, value: 2 });
  });

  it('unwrapOr returns the fallback on error', () => {
    expect(unwrapOr(parsePositive(-1), 7)).toBe(7);
    expect(unwrapOr(parsePositive(4), 7)).toBe(4);
  });
});
