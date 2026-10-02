import { SCHEMAS } from '../src/schemas.js';
import { writeValidators } from './generate-validators.js';
import { GENERATED_DIRECTORY } from './paths.js';

/** Vitest global setup: tests always run against freshly generated validators. */
export function setup(): void {
  writeValidators(GENERATED_DIRECTORY, SCHEMAS);
}
