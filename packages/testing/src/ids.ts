import { createUuidV7Generator } from '@acs/domain';
import type { Id } from '@acs/domain';

/** 2025-10-02T10:13:20Z: the instant every fixture identifier claims to have been created. */
const FIXTURE_CLOCK = 1_759_400_000_000;

/** FNV-1a over the UTF-16 units of `text`, from `seed`: a small, stable, well spread hash. */
function hash32(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

function bytesFor(name: string, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const view = new DataView(new ArrayBuffer(16));
  for (let word = 0; word < 4; word += 1) view.setUint32(word * 4, hash32(name, word + 1));
  bytes.set(new Uint8Array(view.buffer, 0, length));
  return bytes;
}

/**
 * A valid UUID v7 derived from a name: the same name always gives the same identifier, whatever
 * the order the fixtures are built in. Fixtures therefore stay stable and diff cleanly.
 */
export function stableId<Kind extends string = string>(name: string): Id<Kind> {
  return createUuidV7Generator({
    now: () => FIXTURE_CLOCK,
    randomBytes: (length) => bytesFor(name, length),
  })<Kind>();
}
