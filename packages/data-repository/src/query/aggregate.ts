import type { AggregateFunction, JsonValue } from '@acs/domain';
import type { FieldInfo } from '../storage/layout.js';
import { averageDecimals, sumDecimals } from '../values/decimal.js';
import { compareValues } from './compare.js';
import { own } from '../values/own.js';

export type ResolvedAggregate = {
  readonly fn: AggregateFunction;
  readonly info?: FieldInfo;
  readonly as: string;
};

/** Scale of the average of an integer field: it is a decimal, written with two digits. */
const INTEGER_AVERAGE_SCALE = 2;

const present = (rows: readonly Record<string, unknown>[], key: string): unknown[] =>
  rows.map((row) => own(row, key)).filter((value) => value !== undefined && value !== null);

/** An integer sum as a number when it is a safe integer, as its digits otherwise. */
function integerSum(values: readonly unknown[]): JsonValue {
  const digits = sumDecimals(values.map(String), 0);
  const asNumber = Number(digits);
  return Number.isSafeInteger(asNumber) ? asNumber : digits;
}

/**
 * The aggregates of a set of records (EF-BND-03). Absent values are left out. Decimals are added
 * and averaged with big.js, at the scale of the field, so that 0.10 + 0.20 is 0.30; the sum of
 * integers is a number (its digits if it does not fit), the average of integers a decimal with two
 * digits. With nothing to aggregate: `count` is 0, `sum` is 0, the others are `null`.
 */
export function computeAggregates(
  rows: readonly Record<string, unknown>[],
  aggregates: readonly ResolvedAggregate[],
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const { fn, info, as } of aggregates) {
    if (fn === 'count') {
      result[as] = info === undefined ? rows.length : present(rows, info.key).length;
      continue;
    }
    if (info === undefined) continue;
    const values = present(rows, info.key);
    const scale = info.derived?.format?.scale ?? INTEGER_AVERAGE_SCALE;
    const isDecimal = info.type === 'decimal';
    if (fn === 'sum') {
      result[as] = isDecimal ? sumDecimals(values.map(String), scale) : integerSum(values);
    } else if (fn === 'avg') {
      result[as] = averageDecimals(values.map(String), scale) ?? null;
    } else {
      const ordered = [...values].sort((a, b) => compareValues(info, a, b));
      const chosen = fn === 'min' ? ordered[0] : ordered[ordered.length - 1];
      result[as] = (chosen ?? null) as JsonValue;
    }
  }
  return result;
}
