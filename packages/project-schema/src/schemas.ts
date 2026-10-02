import { SecretRefSchema } from './project.js';

/**
 * Every schema compiled into a standalone validator, by name. `scripts/generate-validators.ts`
 * turns this registry into `generated/validators.js`; add a schema here to publish it.
 */
export const SCHEMAS = {
  SecretRef: SecretRefSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;
