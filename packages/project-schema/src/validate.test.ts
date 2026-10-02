import { isDomainError, newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import * as generated from '../generated/validators.js';
import { SCHEMAS } from './schemas.js';
import { toIssues, validate } from './validate.js';
import type { Issue } from './validate.js';

const secretRef = () => ({
  id: newId<'secretRef'>(),
  key: 'smtpPassword',
  description: 'Mot de passe du serveur de messagerie',
});

/** The issues of a failed validation, or an empty list when it unexpectedly succeeded. */
function issuesOf(data: unknown): Issue[] {
  const result = validate('SecretRef', data);
  if (result.ok) return [];
  const details = result.error.details as { issues: Issue[] };
  return details.issues;
}

const found = (issues: Issue[]) => issues.map((issue) => `${issue.keyword} ${issue.path}`);

describe('validate', () => {
  it('returns the document, typed, when it is valid', () => {
    const data = secretRef();
    const result = validate('SecretRef', data);
    expect(result).toEqual({ ok: true, value: data });
  });

  it('fails with MANIFEST_INVALID, the schema name and the issues', () => {
    const result = validate('SecretRef', { ...secretRef(), key: 'Bad-Key' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isDomainError(result.error)).toBe(true);
    expect(result.error.code).toBe('MANIFEST_INVALID');
    expect(result.error.details).toMatchObject({ schema: 'SecretRef' });
  });

  it('points at the property: missing, malformed or of the wrong type', () => {
    const withoutKey = Object.fromEntries(
      Object.entries(secretRef()).filter(([name]) => name !== 'key'),
    );
    expect(found(issuesOf(withoutKey))).toEqual(['required /key']);
    expect(found(issuesOf({ ...secretRef(), key: 'Bad-Key' }))).toEqual(['pattern /key']);
    expect(found(issuesOf({ ...secretRef(), id: 'not-a-uuid' }))).toEqual(['pattern /id']);
    expect(found(issuesOf({ ...secretRef(), description: 42 }))).toEqual(['type /description']);
  });

  it('refuses a secret value or a password next to the reference (EF-SEC-04)', () => {
    expect(found(issuesOf({ ...secretRef(), value: 'hunter2' }))).toEqual([
      'additionalProperties /value',
    ]);
    expect(found(issuesOf({ ...secretRef(), password: 'hunter2' }))).toEqual([
      'additionalProperties /password',
    ]);
  });

  it('reports every issue, not only the first', () => {
    const issues = issuesOf({ id: 'x', key: 'Bad', description: 1, value: 'v' });
    expect(found(issues).sort()).toEqual(
      ['pattern /id', 'pattern /key', 'type /description', 'additionalProperties /value'].sort(),
    );
  });

  it('reports a document that is not an object at the root', () => {
    for (const bad of [null, [], 'text', 12, undefined]) {
      expect(found(issuesOf(bad))).toEqual(['type /']);
    }
  });

  it('does not leak the errors of a previous call into the next one', () => {
    expect(validate('SecretRef', { nope: true }).ok).toBe(false);
    expect(validate('SecretRef', secretRef()).ok).toBe(true);
    expect(found(issuesOf({ ...secretRef(), key: 'Bad' }))).toEqual(['pattern /key']);
  });

  it('works while dynamic code evaluation is blocked (CSP without unsafe-eval)', () => {
    const original = globalThis.Function;
    globalThis.Function = function blocked() {
      throw new EvalError('dynamic code evaluation is blocked');
    } as unknown as FunctionConstructor;
    try {
      expect(validate('SecretRef', secretRef()).ok).toBe(true);
      expect(validate('SecretRef', {}).ok).toBe(false);
    } finally {
      globalThis.Function = original;
    }
  });
});

describe('toIssues', () => {
  const error = (
    partial: Partial<generated.ValidationErrorLike>,
  ): generated.ValidationErrorLike => ({
    instancePath: '',
    schemaPath: '#',
    keyword: 'type',
    params: {},
    ...partial,
  });

  it('appends the missing or unexpected property to the parent path', () => {
    expect(
      toIssues([
        error({
          keyword: 'required',
          instancePath: '/entities/0',
          params: { missingProperty: 'key' },
        }),
        error({
          keyword: 'additionalProperties',
          instancePath: '/entities/0',
          params: { additionalProperty: 'password' },
        }),
      ]).map((issue) => issue.path),
    ).toEqual(['/entities/0/key', '/entities/0/password']);
  });

  it('escapes `/` and `~` in property names (RFC 6901)', () => {
    const [issue] = toIssues([
      error({ keyword: 'additionalProperties', params: { additionalProperty: 'a/b~c' } }),
    ]);
    expect(issue?.path).toBe('/a~1b~0c');
  });

  it('shows the root as `/` and keeps other paths as reported', () => {
    expect(toIssues([error({})])[0]?.path).toBe('/');
    expect(toIssues([error({ instancePath: '/a/1' })])[0]?.path).toBe('/a/1');
  });

  it('falls back to the keyword when Ajv gives no message', () => {
    expect(toIssues([error({ keyword: 'type' })])[0]?.message).toBe('type');
    expect(toIssues([error({ keyword: 'type', message: 'must be string' })])[0]?.message).toBe(
      'must be string',
    );
  });
});

describe('registry', () => {
  it('has a generated validator for every registered schema', () => {
    const validators = generated as unknown as Record<string, unknown>;
    for (const name of Object.keys(SCHEMAS)) {
      expect(typeof validators[`validate${name}`]).toBe('function');
    }
  });
});
