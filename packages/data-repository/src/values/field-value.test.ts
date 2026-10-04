import { FIELD_TYPES } from '@acs/project-schema';
import type { Field, FieldType } from '@acs/project-schema';
import { describe, expect, it, vi } from 'vitest';
import { checkFieldValue } from './field-value.js';

const ID = '0192f1c4-0000-7000-8000-000000000001';
const LIST = {
  kind: 'list',
  values: [
    { value: 'low', label: 'Basse' },
    { value: 'high', label: 'Haute' },
  ],
} as const;

/** A field of the given type; the test cases below only care about `type` and `options`. */
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

function rule(f: Field, value: unknown): string | undefined {
  const result = checkFieldValue(f, value);
  return result.ok ? undefined : result.error.rule;
}

function accepted(f: Field, value: unknown): unknown {
  const result = checkFieldValue(f, value);
  if (!result.ok) throw new Error(`${f.type} ${JSON.stringify(value)}: ${result.error.rule}`);
  return result.value;
}

describe('checkFieldValue: one case per type of dossier 6.3', () => {
  it('string: 255 characters by default, counted as people count them, with a pattern', () => {
    expect(accepted(field('string'), 'x'.repeat(255))).toBe('x'.repeat(255));
    expect(rule(field('string'), 'x'.repeat(256))).toBe('maxLength');
    expect(rule(field('string'), 12)).toBe('type');
    expect(rule(field('string'), null)).toBe('type');
    expect(rule(field('string', { maxLength: 2 }), '😀😀')).toBeUndefined();
    expect(rule(field('string', { maxLength: 2 }), '😀😀😀')).toBe('maxLength');
    const code = field('string', { pattern: '^[A-Z]{2}\\d{2}$' });
    expect(rule(code, 'FR12')).toBeUndefined();
    expect(rule(code, 'fr12')).toBe('pattern');
  });

  it('string: a text far over the limit is refused without being spread into an array first', () => {
    const huge = 'x'.repeat(5_000_000);
    const iterate = vi.spyOn(String.prototype, Symbol.iterator);
    try {
      expect(rule(field('string'), huge)).toBe('maxLength');
      expect(iterate).not.toHaveBeenCalled();
      // Close to the limit it does have to count code points.
      expect(rule(field('string'), 'x'.repeat(256))).toBe('maxLength');
      expect(iterate).toHaveBeenCalled();
    } finally {
      iterate.mockRestore();
    }
    // The edge: a character of two code units still counts as one.
    expect(rule(field('string'), '😀'.repeat(255))).toBeUndefined();
    expect(rule(field('string'), '😀'.repeat(256))).toBe('maxLength');
  });

  it('string: a pattern that could take exponential time is refused, not run', () => {
    expect(rule(field('string', { pattern: '(a+)+$' }), `${'a'.repeat(30)}!`)).toBe(
      'pattern-unsafe',
    );
  });

  it('text: 10 000 characters by default', () => {
    expect(rule(field('text'), 'x'.repeat(10_000))).toBeUndefined();
    expect(rule(field('text'), 'x'.repeat(10_001))).toBe('maxLength');
    expect(rule(field('text', { maxLength: 5 }), 'abcdef')).toBe('maxLength');
  });

  it('integer: a safe integer within min and max', () => {
    const f = field('integer', { min: 1, max: 10 });
    expect(rule(f, 5)).toBeUndefined();
    expect(rule(f, 0)).toBe('min');
    expect(rule(f, 11)).toBe('max');
    expect(rule(f, 1.5)).toBe('type');
    expect(rule(f, '5')).toBe('type');
    expect(rule(field('integer'), 2 ** 53)).toBe('type');
    expect(rule(field('integer'), Number.MAX_SAFE_INTEGER)).toBeUndefined();
    expect(rule(field('integer'), Number.NaN)).toBe('type');
  });

  it('decimal: a string at the scale, returned in canonical form', () => {
    const f = field('decimal', { precision: 6, scale: 2 });
    expect(accepted(f, '12.5')).toBe('12.50');
    expect(rule(f, 12.5)).toBe('type');
    expect(rule(f, '12.555')).toBe('scale');
    expect(rule(f, '12345.00')).toBe('precision');
  });

  it('boolean: null only when nullable', () => {
    expect(rule(field('boolean'), true)).toBeUndefined();
    expect(rule(field('boolean'), 'true')).toBe('type');
    expect(rule(field('boolean'), null)).toBe('type');
    expect(rule(field('boolean', { nullable: false }), null)).toBe('type');
    expect(accepted(field('boolean', { nullable: true }), null)).toBeNull();
  });

  it('date: a real day', () => {
    expect(rule(field('date'), '2028-02-29')).toBeUndefined();
    for (const bad of [
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '2026-1-1',
      '10/03/2026',
    ]) {
      expect(rule(field('date'), bad), bad).toBe('format');
    }
    expect(rule(field('date'), '2100-02-29')).toBe('format');
    expect(rule(field('date'), new Date())).toBe('type');
  });

  it('datetime: ISO 8601 in UTC, with a real day and time', () => {
    expect(rule(field('datetime'), '2026-10-03T14:30:00Z')).toBeUndefined();
    expect(rule(field('datetime'), '2026-10-03T14:30:00.123Z')).toBeUndefined();
    for (const bad of [
      '2026-10-03T14:30:00',
      '2026-10-03T14:30:00+02:00',
      '2026-10-03T24:00:00Z',
      '2026-10-03T14:60:00Z',
      '2026-02-30T10:00:00Z',
      '2026-10-03 14:30:00Z',
    ]) {
      expect(rule(field('datetime'), bad), bad).toBe('format');
    }
  });

  it('choice: a value of the fixed list, or the id of a dictionary record', () => {
    expect(rule(field('choice', { source: LIST }), 'low')).toBeUndefined();
    expect(rule(field('choice', { source: LIST }), 'medium')).toBe('choice');
    expect(rule(field('choice', { source: LIST }), 3)).toBe('type');
    const dictionary = field('choice', { source: { kind: 'dictionary', entity: ID } });
    expect(rule(dictionary, ID)).toBeUndefined();
    expect(rule(dictionary, 'low')).toBe('format');
  });

  it('multiChoice: distinct values of the list, within min and max', () => {
    const f = field('multiChoice', { source: LIST, min: 1, max: 2 });
    expect(rule(f, ['low'])).toBeUndefined();
    expect(rule(f, [])).toBe('count');
    expect(rule(f, ['low', 'high', 'low'])).toBe('unique');
    expect(rule(field('multiChoice', { source: LIST, max: 1 }), ['low', 'high'])).toBe('count');
    expect(rule(f, ['low', 'medium'])).toBe('choice');
    expect(rule(f, 'low')).toBe('type');
  });

  it('reference, file and image: the id of a record (UUID v7)', () => {
    for (const type of ['reference', 'file', 'image'] as const) {
      const f = field(type, type === 'reference' ? { target: ID } : undefined);
      expect(rule(f, ID), type).toBeUndefined();
      expect(rule(f, 'not-an-id'), type).toBe('format');
      expect(rule(f, 42), type).toBe('type');
    }
  });

  it('json: plain data, bounded', () => {
    expect(rule(field('json'), { a: [1, 'x', null, { b: true }] })).toBeUndefined();
    expect(rule(field('json'), undefined)).toBe('type');
    expect(rule(field('json'), Number.POSITIVE_INFINITY)).toBe('type');
    expect(rule(field('json'), new Date())).toBe('type');
    expect(rule(field('json'), () => 1)).toBe('type');
    expect(rule(field('json'), JSON.parse('{"__proto__": {"x": 1}}'))).toBe('type');
    let deep: unknown = 1;
    for (let level = 0; level < 40; level += 1) deep = [deep];
    expect(rule(field('json'), deep)).toBe('depth');
    expect(
      rule(
        field('json'),
        Array.from({ length: 10_001 }, () => 0),
      ),
    ).toBe('depth');
  });

  it('covers every type of the manifest, and says no to something for each (negative control)', () => {
    const samples: Record<FieldType, { ok: unknown; bad: unknown; options?: object }> = {
      string: { ok: 'a', bad: 1 },
      text: { ok: 'a', bad: 1 },
      integer: { ok: 1, bad: 'a' },
      decimal: { ok: '1.0', bad: 1, options: { precision: 5, scale: 1 } },
      boolean: { ok: true, bad: 'a' },
      date: { ok: '2026-01-01', bad: 'a' },
      datetime: { ok: '2026-01-01T00:00:00Z', bad: 'a' },
      choice: { ok: 'low', bad: 'a', options: { source: LIST } },
      multiChoice: { ok: ['low'], bad: 'a', options: { source: LIST } },
      reference: { ok: ID, bad: 'a', options: { target: ID } },
      file: { ok: ID, bad: 'a' },
      image: { ok: ID, bad: 'a' },
      json: { ok: {}, bad: undefined },
    };
    for (const type of FIELD_TYPES) {
      const sample = samples[type];
      const f = field(type, sample.options);
      expect(checkFieldValue(f, sample.ok).ok, `${type} accepts its sample`).toBe(true);
      expect(checkFieldValue(f, sample.bad).ok, `${type} refuses a wrong value`).toBe(false);
    }
  });
});
