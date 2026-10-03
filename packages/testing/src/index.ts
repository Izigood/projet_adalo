import { completeFixture } from './fixtures/complete.js';
import { CORRUPTED_FIXTURES } from './fixtures/corrupted.js';
import { interactiveFixture } from './fixtures/interactive.js';
import { legacyV0ExpectedV1, legacyV0Fixture } from './fixtures/legacy-v0.js';
import { minimalFixture } from './fixtures/minimal.js';
import { referenceFixture } from './fixtures/reference.js';
import { responsiveFixture } from './fixtures/responsive.js';
import type { FixtureFiles } from './package-builder.js';

export { consistencyProblems } from './consistency.js';
export { stableId } from './ids.js';
export { schemaOf } from './schema-of.js';
export { addPage } from './add-page.js';
export type { PageSpec } from './add-page.js';
export { buildPackage } from './package-builder.js';
export { routingIndex, routingPage } from './routing-builders.js';
export type { FixtureDocuments, FixtureFiles } from './package-builder.js';
export {
  CORRUPTED_FIXTURES,
  completeFixture,
  interactiveFixture,
  legacyV0ExpectedV1,
  legacyV0Fixture,
  minimalFixture,
  referenceFixture,
  responsiveFixture,
};
export type { CorruptedCase, CorruptedCategory } from './fixtures/corrupted.js';

/** Valid reference fixtures by name. Each call of a builder returns a fresh, modifiable copy. */
export const VALID_FIXTURES: Readonly<Record<string, () => FixtureFiles>> = {
  minimal: minimalFixture,
  reference: referenceFixture,
  complete: completeFixture,
  responsive: responsiveFixture,
  interactive: interactiveFixture,
};
