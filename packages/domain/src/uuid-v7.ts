import type { Id } from './id.js';

/**
 * UUID v7 (RFC 9562): 48-bit Unix millisecond timestamp, version 7, a 12-bit counter in rand_a,
 * variant 10, then 62 random bits. Identifiers sort by creation time (dossier 6.4) and are strictly
 * increasing within one generator, even inside a single millisecond or when the clock goes back.
 */

const COUNTER_MAX = 0xfff;
/** Seeds stay below half the counter range so a burst in one millisecond has room to grow. */
const COUNTER_SEED_RANGE = 0x800;
const TIMESTAMP_LIMIT = 2 ** 48;

export type UuidV7Source = {
  readonly now: () => number;
  /** Returns `length` random bytes. */
  readonly randomBytes: (length: number) => Uint8Array;
};

const systemSource: UuidV7Source = {
  now: () => Date.now(),
  randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
};

/** 2 bytes seed the counter, 8 bytes fill rand_b. */
const RANDOM_BYTES = 10;

export function createUuidV7Generator(
  source: UuidV7Source = systemSource,
): <Kind extends string = string>() => Id<Kind> {
  let lastMs = -1;
  let counter = 0;

  return <Kind extends string = string>(): Id<Kind> => {
    const now = Math.floor(source.now());
    if (!Number.isSafeInteger(now) || now < 0 || now >= TIMESTAMP_LIMIT) {
      throw new RangeError(`UUID v7 clock out of range: ${String(source.now())}`);
    }
    const random = source.randomBytes(RANDOM_BYTES);
    const entropy = new DataView(random.buffer, random.byteOffset, random.byteLength);
    const seed = () => entropy.getUint16(0) % COUNTER_SEED_RANGE;

    if (now > lastMs) {
      lastMs = now;
      counter = seed();
    } else {
      // Same millisecond, or the clock went backwards: keep the order by counting up.
      counter += 1;
      if (counter > COUNTER_MAX) {
        lastMs += 1;
        counter = seed();
      }
    }

    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, Math.floor(lastMs / 2 ** 32));
    view.setUint32(2, lastMs % 2 ** 32);
    view.setUint16(6, 0x7000 | counter);
    bytes.set(random.subarray(2, RANDOM_BYTES), 8);
    view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Id<Kind>;
  };
}

const defaultGenerator = createUuidV7Generator();

/** A new identifier from the shared generator (system clock and crypto randomness). */
export function newId<Kind extends string = string>(): Id<Kind> {
  return defaultGenerator<Kind>();
}
