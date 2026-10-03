import { err, ok } from '@acs/domain';
import type { Result } from '@acs/domain';
import Big from 'big.js';

// Division keeps 80 digits, then rounds half up: a monetary average rounds the way people expect.
// This is the package's own setting of the shared `Big` constructor (ADR-0017).
Big.DP = 80;
Big.RM = Big.roundHalfUp;

/** `precision` digits in all, `scale` of them after the point (dossier 6.3). */
export type DecimalFormat = { readonly precision: number; readonly scale: number };

export type DecimalIssue = {
  readonly rule: 'type' | 'format' | 'scale' | 'precision';
  readonly message: string;
};

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;
/** A decimal of 38 digits is 40 characters; anything much longer is not a number worth parsing. */
const MAX_TEXT_LENGTH = 100;

/** Fixed notation at `scale`, with no negative zero. */
function fixed(value: Big, scale: number): string {
  return (value.eq(0) ? new Big(0) : value).toFixed(scale);
}

/**
 * The canonical text of a decimal: plain digits, exactly `scale` after the point, no sign on zero.
 * A decimal is a string, never a `number` (decision D-07); a value with more digits after the
 * point than the scale allows is refused, not rounded, because rounding hides an error.
 */
export function canonicalDecimal(
  input: unknown,
  format: DecimalFormat,
): Result<string, DecimalIssue> {
  if (typeof input !== 'string') {
    return err({ rule: 'type', message: 'a decimal is written as a string, never as a number' });
  }
  if (input.length > MAX_TEXT_LENGTH || !DECIMAL_TEXT.test(input)) {
    return err({ rule: 'format', message: 'a decimal is digits with an optional point and sign' });
  }
  const value = new Big(input);
  if (!value.round(format.scale, Big.roundDown).eq(value)) {
    return err({ rule: 'scale', message: `at most ${format.scale} digits after the point` });
  }
  const magnitude = value.abs();
  const integerDigits = magnitude.lt(1) ? 0 : magnitude.round(0, Big.roundDown).toFixed(0).length;
  if (integerDigits > format.precision - format.scale) {
    return err({
      rule: 'precision',
      message: `at most ${format.precision - format.scale} digits before the point`,
    });
  }
  return ok(fixed(value, format.scale));
}

/**
 * A key whose text order is the numeric order of the decimal, for an index (a canonical string
 * does not sort numerically: "10.00" comes before "9.00", "-1.00" before "-2.00"). The first
 * character is the sign (1 for zero and above); the digits are padded to `precision`, and for a
 * negative number they are the nines' complement, so the more negative sorts first.
 */
export function decimalSortKey(canonical: string, format: DecimalFormat): string {
  const negative = canonical.startsWith('-');
  const digits = canonical.replace('-', '').replace('.', '').padStart(format.precision, '0');
  if (!negative) return `1${digits}`;
  return `0${[...digits].map((digit) => String(9 - Number(digit))).join('')}`;
}

/**
 * A decimal given as a filter value: any number of digits, in plain notation, as the plain text
 * of the number (a filter may ask for `gt 0.001` on a field of scale 2). Undefined if it is not one.
 */
export function looseDecimal(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length > MAX_TEXT_LENGTH || !DECIMAL_TEXT.test(input)) {
    return undefined;
  }
  const value = new Big(input);
  return value.eq(0) ? '0' : value.toFixed();
}

export function compareDecimals(a: string, b: string): number {
  return new Big(a).cmp(b);
}

export function sumDecimals(values: readonly string[], scale: number): string {
  return fixed(
    values.reduce((total, value) => total.plus(value), new Big(0)),
    scale,
  );
}

/** The mean at `scale`, rounded half up; undefined for no values. */
export function averageDecimals(values: readonly string[], scale: number): string | undefined {
  if (values.length === 0) return undefined;
  const total = values.reduce((sum, value) => sum.plus(value), new Big(0));
  return fixed(total.div(values.length).round(scale, Big.roundHalfUp), scale);
}
