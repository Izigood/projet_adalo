import { describe, expect, it } from 'vitest';
import {
  completeFixture,
  legacyV0ExpectedV1,
  legacyV0Fixture,
  minimalFixture,
  referenceFixture,
  responsiveFixture,
} from './index.js';

/**
 * Reference fixtures must never be modified to make a test pass (CLAUDE.md, dossier 9.4). Each one
 * is pinned by the SHA-256 of its canonical JSON (sorted keys): changing a fixture, even
 * harmlessly, fails here and forces the change to be deliberate and reviewed. To update a digest
 * on purpose, write the reason in the commit message.
 */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PINNED: ReadonlyArray<readonly [string, () => unknown, string]> = [
  ['minimal', minimalFixture, 'de587d0c068b2377e8ead34fd173e590385b58ab2807842d294e7389fbbbf601'],
  [
    'reference',
    referenceFixture,
    'cc3cf31a8e7b70ebac01c8a68b88dbb9dde09d72fc0fe9ed481e062513d13756',
  ],
  [
    'responsive',
    responsiveFixture,
    '489f9fc7b2768d985f2499619bdab9b335c6d89c76b427adf83758c2761d6171',
  ],
  ['complete', completeFixture, '52228af105ddd25fb8da8068f477f77e94445ca959e618238c62046222393bd0'],
  [
    'legacy v0',
    legacyV0Fixture,
    '686f33141211df71ab65a9bc85ca4bbd099392971502ff515e1f4a7fe3baad18',
  ],
  [
    'legacy v0 expected v1',
    legacyV0ExpectedV1,
    '95fc188a655a9625285593850afe33f5564b97474e8d947e29f229d7ad032de2',
  ],
];

describe('reference fixtures are pinned', () => {
  it.each(PINNED)('%s keeps its digest', async (_name, build, expected) => {
    expect(await digest(build())).toBe(expected);
  });

  it('the digest measures content: a one-character change gives another digest', async () => {
    const files = minimalFixture();
    const before = await digest(files);
    (files['project.json'] as { key: string }).key += 'x';
    expect(await digest(files)).not.toBe(before);
  });
});
