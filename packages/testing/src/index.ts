import { minimalFixture } from './fixtures/minimal.js';
import { referenceFixture } from './fixtures/reference.js';
import type { FixtureFiles } from './package-builder.js';

export { consistencyProblems } from './consistency.js';
export { stableId } from './ids.js';
export { buildPackage } from './package-builder.js';
export type { FixtureDocuments, FixtureFiles } from './package-builder.js';
export { minimalFixture, referenceFixture };

/** Valid reference fixtures by name. Each call of a builder returns a fresh, modifiable copy. */
export const VALID_FIXTURES: Readonly<Record<string, () => FixtureFiles>> = {
  minimal: minimalFixture,
  reference: referenceFixture,
};
