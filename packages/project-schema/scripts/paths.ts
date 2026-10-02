import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the standalone validators are written: packages/project-schema/generated (not versioned). */
export const GENERATED_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');
