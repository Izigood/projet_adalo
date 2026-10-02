import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { Static } from '@sinclair/typebox';
import * as generated from '../generated/validators.js';
import type { ValidationErrorLike } from '../generated/validators.js';
import { SCHEMAS } from './schemas.js';
import type { SchemaName } from './schemas.js';

/** One thing wrong in a document. `path` is a JSON Pointer (RFC 6901); the root is `/`. */
export type Issue = {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Readonly<Record<string, unknown>>;
};

export type ValidationDetails = { readonly schema: SchemaName; readonly issues: readonly Issue[] };

/**
 * Ajv reports a missing or unexpected property at the path of its parent. The path returned here
 * points at the property itself, which is what a designer needs to see.
 */
export function toIssues(errors: readonly ValidationErrorLike[]): Issue[] {
  return errors.map((error) => {
    const missing = error.params['missingProperty'];
    const unexpected = error.params['additionalProperty'];
    const child =
      error.keyword === 'required' && typeof missing === 'string'
        ? missing
        : error.keyword === 'additionalProperties' && typeof unexpected === 'string'
          ? unexpected
          : undefined;
    const base = error.instancePath;
    const path =
      child === undefined ? base : `${base}/${child.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    return {
      path: path === '' ? '/' : path,
      keyword: error.keyword,
      message: error.message ?? error.keyword,
      params: error.params,
    };
  });
}

/** Validates `data` against the named schema with its generated standalone validator. */
export function validate<Name extends SchemaName>(
  name: Name,
  data: unknown,
): Result<Static<(typeof SCHEMAS)[Name]>, DomainError> {
  const validator = generated[`validate${name}`];
  if (validator(data)) return ok(data as Static<(typeof SCHEMAS)[Name]>);
  const issues = toIssues(validator.errors ?? []);
  const details: ValidationDetails = { schema: name, issues };
  return err(
    domainError('MANIFEST_INVALID', `${name} is invalid (${issues.length} issue(s))`, {
      details: { ...details },
    }),
  );
}
