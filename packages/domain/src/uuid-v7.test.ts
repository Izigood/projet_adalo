import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createUuidV7Generator, isUuidV7, newId } from './index.js';
import type { UuidV7Source } from './index.js';

const timestampOf = (id: string): number => parseInt(id.replaceAll('-', '').slice(0, 12), 16);
const counterOf = (id: string): number => parseInt(id.replaceAll('-', '').slice(13, 16), 16);

/** A source with a scripted clock and zeroed randomness: fully deterministic. */
function scripted(clock: () => number, fill = 0): UuidV7Source {
  return { now: clock, randomBytes: (length) => new Uint8Array(length).fill(fill) };
}

describe('UUID v7 format', () => {
  it('is a canonical UUID with version 7 and variant 10, carrying the clock in its first 48 bits', () => {
    const at = 1_759_400_000_123;
    const id = createUuidV7Generator(scripted(() => at))();
    expect(isUuidV7(id)).toBe(true);
    expect(timestampOf(id)).toBe(at);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('encodes timestamps beyond 32 bits (the high 16 bits are written)', () => {
    const high = 2 ** 47 + 12_345;
    expect(timestampOf(createUuidV7Generator(scripted(() => high))())).toBe(high);
  });

  it('forces the variant bits even when the random bytes are all ones', () => {
    const id = createUuidV7Generator(scripted(() => 1, 0xff))();
    expect(isUuidV7(id)).toBe(true);
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('floors a fractional clock reading', () => {
    expect(timestampOf(createUuidV7Generator(scripted(() => 1000.9))())).toBe(1000);
  });

  it('rejects a clock that is negative, not an integer once floored, or beyond 48 bits', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 48]) {
      expect(() => createUuidV7Generator(scripted(() => bad))()).toThrow(RangeError);
    }
  });
});

describe('UUID v7 ordering', () => {
  it('is strictly increasing over 10 000 identifiers generated in the same millisecond', () => {
    const next = createUuidV7Generator(scripted(() => 5_000));
    const ids = Array.from({ length: 10_000 }, () => next());
    for (let i = 1; i < ids.length; i += 1) {
      expect((ids[i] ?? '') > (ids[i - 1] ?? '')).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('moves to the next millisecond when the 12-bit counter is exhausted', () => {
    const next = createUuidV7Generator(scripted(() => 7_000));
    const ids = Array.from({ length: 5_000 }, () => next());
    expect(counterOf(ids[0] ?? '')).toBe(0);
    expect(counterOf(ids[4_095] ?? '')).toBe(4_095);
    expect(timestampOf(ids[4_095] ?? '')).toBe(7_000);
    expect(timestampOf(ids[4_096] ?? '')).toBe(7_001);
    expect(counterOf(ids[4_096] ?? '')).toBe(0);
  });

  it('stays increasing when the clock goes backwards', () => {
    const readings = [10_000, 9_000, 9_500, 10_000, 8_000];
    let call = 0;
    const next = createUuidV7Generator(scripted(() => readings[Math.min(call++, 4)] ?? 0));
    const ids = readings.map(() => next());
    for (let i = 1; i < ids.length; i += 1) {
      expect((ids[i] ?? '') > (ids[i - 1] ?? '')).toBe(true);
    }
    expect(timestampOf(ids[4] ?? '')).toBe(10_000);
  });

  it('seeds a fresh counter below half the range, whatever the random bytes', () => {
    const id = createUuidV7Generator(scripted(() => 1, 0xff))();
    expect(counterOf(id)).toBeLessThan(0x800);
  });

  it('property: identifiers stay valid and strictly increasing for any clock sequence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2 ** 47 }), { minLength: 1, maxLength: 200 }),
        (clock) => {
          let call = 0;
          const next = createUuidV7Generator({
            now: () => clock[call++] ?? 0,
            randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
          });
          const ids = clock.map(() => next());
          return ids.every((id, i) => isUuidV7(id) && (i === 0 || id > (ids[i - 1] ?? '')));
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('UUID v7 uniqueness', () => {
  const real = (): UuidV7Source => ({
    now: () => 42_000,
    randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
  });

  it('two independent generators on the same clock never collide', () => {
    const a = createUuidV7Generator(real());
    const b = createUuidV7Generator(real());
    const ids = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) {
      ids.add(a());
      ids.add(b());
    }
    expect(ids.size).toBe(2_000);
  });

  it('the collision check detects a generator without entropy (negative control)', () => {
    const a = createUuidV7Generator(scripted(() => 42_000));
    const b = createUuidV7Generator(scripted(() => 42_000));
    expect(a()).toBe(b());
  });
});

describe('newId', () => {
  it('returns valid, increasing identifiers from the shared generator', () => {
    const first = newId<'entity'>();
    const second = newId<'entity'>();
    expect(isUuidV7(first)).toBe(true);
    expect(second > first).toBe(true);
  });
});
