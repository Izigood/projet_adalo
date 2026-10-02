import { SCHEMAS } from '../src/schemas.js';
import { writeValidators } from './generate-validators.js';
import { GENERATED_DIRECTORY } from './paths.js';

/** `pnpm generate`: writes the standalone validators of every registered schema. */
writeValidators(GENERATED_DIRECTORY, SCHEMAS);
console.log(`Validators generated in ${GENERATED_DIRECTORY}`);
