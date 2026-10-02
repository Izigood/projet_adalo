import { describe, expect, it } from 'vitest';
import { parseParam } from './params.js';

describe('parseParam', () => {
  it('accepts any non-empty text as a string', () => {
    expect(parseParam('string', 'abc')).toBe('abc');
    expect(parseParam('string', '')).toBeUndefined();
  });

  it('reads an integer as a number, without padding, sign-only zero or unsafe values', () => {
    expect(parseParam('integer', '42')).toBe(42);
    expect(parseParam('integer', '-7')).toBe(-7);
    expect(parseParam('integer', '0')).toBe(0);
    for (const bad of ['', '007', '-0', '+1', '1.5', '1e3', ' 1', 'abc', '9007199254740993']) {
      expect(parseParam('integer', bad), bad).toBeUndefined();
    }
  });

  it('accepts only a lower-case UUID v7', () => {
    const id = '01890a5d-ac96-774b-bcce-b302099a8057';
    expect(parseParam('uuid', id)).toBe(id);
    expect(parseParam('uuid', id.toUpperCase())).toBeUndefined();
    expect(parseParam('uuid', '550e8400-e29b-41d4-a716-446655440000')).toBeUndefined();
    expect(parseParam('uuid', 'not-an-id')).toBeUndefined();
  });
});
