import { describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES, domainError, isDomainError } from './index.js';

describe('domainError', () => {
  it('follows the { code, message, details?, correlationId } shape of section 7.7', () => {
    const error = domainError('VERSION_CONFLICT', 'stale', { details: { expectedVersion: 2 } });
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.message).toBe('stale');
    expect(error.details).toEqual({ expectedVersion: 2 });
    expect(error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('omits details when none are given and keeps a provided correlation id', () => {
    const error = domainError('STORAGE_QUOTA', 'full', { correlationId: 'abc' });
    expect('details' in error).toBe(false);
    expect(error.correlationId).toBe('abc');
  });

  it('generates a distinct correlation id per error', () => {
    const a = domainError('PKG_INTEGRITY', 'x');
    const b = domainError('PKG_INTEGRITY', 'x');
    expect(a.correlationId).not.toBe(b.correlationId);
  });

  it('catalogues the 7 codes of section 7.7 and the 2 manifest codes of section 6.5', () => {
    expect([...DOMAIN_ERROR_CODES].sort()).toEqual(
      [
        'CONSTRAINT_VIOLATION',
        'EXPRESSION_BUDGET',
        'EXPRESSION_INVALID',
        'MANIFEST_INVALID',
        'MANIFEST_UNSUPPORTED',
        'PKG_INTEGRITY',
        'REFERENCE_BLOCKED',
        'STORAGE_QUOTA',
        'VERSION_CONFLICT',
      ].sort(),
    );
  });

  it('isDomainError accepts real errors and rejects look-alikes', () => {
    expect(isDomainError(domainError('REFERENCE_BLOCKED', 'in use'))).toBe(true);
    expect(isDomainError({ code: 'NOPE', message: 'x', correlationId: 'y' })).toBe(false);
    expect(isDomainError({ code: 'STORAGE_QUOTA', message: 'x' })).toBe(false);
    expect(isDomainError(null)).toBe(false);
    expect(isDomainError('STORAGE_QUOTA')).toBe(false);
  });
});
