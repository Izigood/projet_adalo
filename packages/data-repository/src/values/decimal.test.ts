import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  averageDecimals,
  canonicalDecimal,
  compareDecimals,
  decimalSortKey,
  sumDecimals,
} from './decimal.js';
import type { DecimalFormat } from './decimal.js';

const money: DecimalFormat = { precision: 12, scale: 2 };

function canonical(input: unknown, format: DecimalFormat = money): string {
  const result = canonicalDecimal(input, format);
  if (!result.ok) throw new Error(`${String(input)}: ${result.error.rule}`);
  return result.value;
}

function rule(input: unknown, format: DecimalFormat = money): string | undefined {
  const result = canonicalDecimal(input, format);
  return result.ok ? undefined : result.error.rule;
}

describe('canonicalDecimal (D-07)', () => {
  it('writes exactly `scale` digits after the point and drops useless zeros and signs', () => {
    expect(canonical('1.5')).toBe('1.50');
    expect(canonical('007.1')).toBe('7.10');
    expect(canonical('12')).toBe('12.00');
    expect(canonical('-0')).toBe('0.00');
    expect(canonical('-0.00')).toBe('0.00');
    expect(canonical('1.500')).toBe('1.50');
    expect(canonical('3', { precision: 5, scale: 0 })).toBe('3');
  });

  it('refuses a number, text that is not a decimal, and exponents', () => {
    expect(rule(1.5)).toBe('type');
    expect(rule(null)).toBe('type');
    for (const text of ['', 'abc', '1e3', '1,5', '+1', '.5', '1.', ' 1', '1 ']) {
      expect(rule(text), text).toBe('format');
    }
    expect(rule('1'.repeat(101))).toBe('format');
  });

  it('refuses digits it would have to round away', () => {
    expect(rule('1.234')).toBe('scale');
    expect(rule('0.001')).toBe('scale');
    expect(rule('1.5', { precision: 5, scale: 0 })).toBe('scale');
  });

  it('keeps within precision digits in all', () => {
    expect(canonical('9999999999.99')).toBe('9999999999.99');
    expect(rule('10000000000.00')).toBe('precision');
    expect(canonical('0.5', { precision: 1, scale: 1 })).toBe('0.5');
    expect(rule('1.0', { precision: 1, scale: 1 })).toBe('precision');
  });
});

describe('decimal arithmetic', () => {
  it('adds without the error of binary floating point', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumDecimals(['0.10', '0.20'], 2)).toBe('0.30');
    expect(sumDecimals(['19.99', '5.01', '-0.50'], 2)).toBe('24.50');
    expect(sumDecimals([], 2)).toBe('0.00');
  });

  it('averages at the scale, half up, and has no average of nothing', () => {
    expect(averageDecimals(['1.00', '2.00'], 2)).toBe('1.50');
    expect(averageDecimals(['1.00', '1.00', '2.00'], 2)).toBe('1.33');
    expect(averageDecimals(['0.01', '0.00'], 2)).toBe('0.01');
    expect(averageDecimals(['-0.001', '0.000'], 2)).toBe('0.00');
    expect(averageDecimals([], 2)).toBeUndefined();
  });

  it('compares numerically', () => {
    expect(compareDecimals('10.00', '9.00')).toBe(1);
    expect(compareDecimals('-1.00', '-2.00')).toBe(1);
    expect(compareDecimals('1.50', '1.5')).toBe(0);
  });
});

/** A decimal of the format built from its count of units (hundredths for a scale of 2). */
function fromUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const point = digits.length - scale;
  const text = scale === 0 ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${text}` : text;
}

describe('decimalSortKey', () => {
  it('sorts as text exactly as the numbers sort (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.bigInt({ min: -(10n ** 12n) + 1n, max: 10n ** 12n - 1n }),
        fc.bigInt({ min: -(10n ** 12n) + 1n, max: 10n ** 12n - 1n }),
        (scale, a, b) => {
          const format = { precision: 12 + scale, scale };
          const left = fromUnits(a, scale);
          const right = fromUnits(b, scale);
          const keys = [decimalSortKey(left, format), decimalSortKey(right, format)] as const;
          expect(Math.sign(keys[0] < keys[1] ? -1 : keys[0] > keys[1] ? 1 : 0)).toBe(
            Math.sign(compareDecimals(left, right)),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('is needed: the canonical text itself does not sort as a number (negative control)', () => {
    expect('10.00' < '9.00').toBe(true);
    expect('-1.00' < '-2.00').toBe(true);
    const format = { precision: 5, scale: 2 };
    expect(decimalSortKey('9.00', format) < decimalSortKey('10.00', format)).toBe(true);
    expect(decimalSortKey('-2.00', format) < decimalSortKey('-1.00', format)).toBe(true);
    expect(decimalSortKey('-1.00', format) < decimalSortKey('0.00', format)).toBe(true);
  });

  it('gives every value of a field a key of the same length', () => {
    const format = { precision: 8, scale: 3 };
    const lengths = new Set(
      ['0.000', '-0.001', '99999.999', '-99999.999', '12.5'].map(
        (text) => decimalSortKey(canonical(text, format), format).length,
      ),
    );
    expect(lengths.size).toBe(1);
  });
});
