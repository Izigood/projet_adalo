import type { JsonValue } from '@acs/domain';
import type { Field, FieldType } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';
import { conversionFor } from './convert.js';

const ID = '0192f1c4-0000-7000-8000-000000000001';
const LIST = {
  source: {
    kind: 'list',
    values: [
      { value: 'low', label: 'Basse' },
      { value: 'high', label: 'Haute' },
    ],
  },
};

function field(type: FieldType, options?: object): Field {
  return {
    id: ID,
    key: 'f',
    label: 'F',
    required: false,
    classification: 'public',
    type,
    ...(options === undefined ? {} : { options }),
  } as Field;
}

const DECIMAL = { precision: 8, scale: 2 };

function convert(from: Field, to: Field, value: JsonValue): unknown {
  const conversion = conversionFor(from, to);
  if (conversion === undefined) throw new Error(`no conversion ${from.type}>${to.type}`);
  const result = conversion.convert(value);
  return result.ok ? result.value : { error: result.error };
}

describe('conversions that work', () => {
  it.each<[string, Field, Field, JsonValue, JsonValue]>([
    ['string to text', field('string'), field('text'), 'abc', 'abc'],
    ['text to string', field('text'), field('string'), 'abc', 'abc'],
    ['string to integer', field('string'), field('integer'), '-42', -42],
    ['text to integer', field('text'), field('integer'), '7', 7],
    ['string to decimal', field('string'), field('decimal', DECIMAL), '1.5', '1.50'],
    ['string to boolean', field('string'), field('boolean'), 'true', true],
    ['text to boolean', field('text'), field('boolean'), 'false', false],
    ['string to date', field('string'), field('date'), '2028-02-29', '2028-02-29'],
    [
      'string to datetime',
      field('string'),
      field('datetime'),
      '2026-10-03T14:30:00Z',
      '2026-10-03T14:30:00Z',
    ],
    ['string to choice', field('string'), field('choice', LIST), 'low', 'low'],
    ['integer to decimal', field('integer'), field('decimal', DECIMAL), 12, '12.00'],
    ['integer to string', field('integer'), field('string'), 12, '12'],
    ['integer to text', field('integer'), field('text'), -3, '-3'],
    ['decimal to string', field('decimal', DECIMAL), field('string'), '1.50', '1.50'],
    ['boolean to string', field('boolean'), field('string'), true, 'true'],
    ['date to datetime', field('date'), field('datetime'), '2026-10-03', '2026-10-03T00:00:00Z'],
    ['date to string', field('date'), field('string'), '2026-10-03', '2026-10-03'],
    [
      'datetime to string',
      field('datetime'),
      field('text'),
      '2026-10-03T14:30:00Z',
      '2026-10-03T14:30:00Z',
    ],
    ['choice to string', field('choice', LIST), field('string'), 'low', 'low'],
    [
      'decimal to more decimals',
      field('decimal', DECIMAL),
      field('decimal', { precision: 10, scale: 3 }),
      '1.50',
      '1.500',
    ],
    [
      'decimal to fewer decimals when nothing is lost',
      field('decimal', { precision: 10, scale: 3 }),
      field('decimal', DECIMAL),
      '1.500',
      '1.50',
    ],
  ])('%s', (_name, from, to, value, expected) => {
    expect(convert(from, to, value)).toEqual(expected);
  });

  it('says which conversions lose information', () => {
    expect(conversionFor(field('datetime'), field('date'))?.lossy).toBe(true);
    expect(convert(field('datetime'), field('date'), '2026-10-03T23:59:59Z')).toBe('2026-10-03');
    for (const [from, to] of [
      [field('string'), field('text')],
      [field('integer'), field('decimal', DECIMAL)],
      [field('date'), field('datetime')],
    ] as const) {
      expect(conversionFor(from, to)?.lossy).toBe(false);
    }
  });
});

describe('a value that cannot be converted is named, not rounded or guessed', () => {
  it.each<[string, Field, Field, JsonValue]>([
    ['not an integer', field('string'), field('integer'), 'abc'],
    ['an integer that does not fit', field('string'), field('integer'), '99999999999999999999'],
    ['a decimal point in an integer', field('string'), field('integer'), '1.5'],
    ['not a boolean', field('string'), field('boolean'), 'yes'],
    ['not a date', field('string'), field('date'), '2026-02-30'],
    ['not a datetime', field('string'), field('datetime'), '2026-10-03'],
    ['not in the list', field('string'), field('choice', LIST), 'medium'],
    ['too many decimals', field('string'), field('decimal', DECIMAL), '1.555'],
    ['too long for a string', field('text'), field('string'), 'x'.repeat(300)],
    [
      'a decimal that would lose digits',
      field('decimal', { precision: 10, scale: 3 }),
      field('decimal', DECIMAL),
      '1.505',
    ],
    [
      'a decimal too big for the new precision',
      field('decimal', DECIMAL),
      field('decimal', { precision: 4, scale: 2 }),
      '1234.50',
    ],
  ])('%s', (_name, from, to, value) => {
    const result = convert(from, to, value) as { error?: string };
    expect(typeof result.error).toBe('string');
  });
});

describe('conversions there are not', () => {
  it.each<[FieldType, FieldType]>([
    ['json', 'string'],
    ['reference', 'integer'],
    ['string', 'json'],
    ['boolean', 'integer'],
    ['integer', 'date'],
    ['file', 'image'],
    ['multiChoice', 'string'],
    ['decimal', 'integer'],
  ])('%s to %s', (from, to) => {
    expect(conversionFor(field(from), field(to))).toBeUndefined();
  });
});
