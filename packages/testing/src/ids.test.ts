import { isUuidV7 } from '@acs/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stableId } from './index.js';

const timestampOf = (id: string): number => parseInt(id.replaceAll('-', '').slice(0, 12), 16);

describe('stableId', () => {
  it('returns a valid UUID v7', () => {
    expect(isUuidV7(stableId('anything'))).toBe(true);
    expect(isUuidV7(stableId(''))).toBe(true);
  });

  it('always gives the same identifier for the same name, in any order', () => {
    const first = [stableId('a'), stableId('b'), stableId('c')];
    const second = [stableId('c'), stableId('b'), stableId('a')].reverse();
    expect(second).toEqual(first);
  });

  it('gives different identifiers to names that differ by one character', () => {
    expect(stableId('reference.customer.name')).not.toBe(stableId('reference.customer.nama'));
    expect(stableId('a')).not.toBe(stableId('A'));
    expect(stableId('a')).not.toBe(stableId('a '));
  });

  it('claims one fixed creation instant, so fixtures do not change with the clock', () => {
    expect(timestampOf(stableId('x'))).toBe(1_759_400_000_000);
    expect(timestampOf(stableId('y'))).toBe(1_759_400_000_000);
  });

  it('property: valid for any name, and distinct names do not collide over 1 000 draws', () => {
    fc.assert(
      fc.property(fc.string(), (name) => isUuidV7(stableId(name))),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(fc.uniqueArray(fc.string(), { minLength: 50, maxLength: 200 }), (names) => {
        const ids = new Set(names.map((name) => stableId(name)));
        return ids.size === names.length;
      }),
      { numRuns: 100 },
    );
  });
});
