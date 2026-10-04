/**
 * Business error codes: catalogue of dossier section 7.7, plus the two manifest codes of 6.5 and
 * COMPONENT_INVALID (a component definition refused at registration, ADR-0034), and the three
 * codes of the local data layer (ADR-0036): QUERY_INVALID (a query the engine cannot run),
 * MIGRATION_BLOCKED (a data migration that needs a decision first) and STORAGE_UNAVAILABLE (no
 * usable IndexedDB); and ENVIRONMENT_FORBIDDEN (test data that would leave the test data base,
 * RG-04).
 */
export const DOMAIN_ERROR_CODES = [
  'CONSTRAINT_VIOLATION',
  'VERSION_CONFLICT',
  'REFERENCE_BLOCKED',
  'EXPRESSION_INVALID',
  'EXPRESSION_BUDGET',
  'STORAGE_QUOTA',
  'PKG_INTEGRITY',
  'MANIFEST_INVALID',
  'MANIFEST_UNSUPPORTED',
  'COMPONENT_INVALID',
  'QUERY_INVALID',
  'MIGRATION_BLOCKED',
  'STORAGE_UNAVAILABLE',
  'ENVIRONMENT_FORBIDDEN',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainError = {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
};

export type DomainErrorOptions = {
  readonly details?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
};

export function domainError(
  code: DomainErrorCode,
  message: string,
  options: DomainErrorOptions = {},
): DomainError {
  const correlationId = options.correlationId ?? globalThis.crypto.randomUUID();
  return options.details === undefined
    ? { code, message, correlationId }
    : { code, message, details: options.details, correlationId };
}

export function isDomainError(value: unknown): value is DomainError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['code'] === 'string' &&
    (DOMAIN_ERROR_CODES as readonly string[]).includes(candidate['code']) &&
    typeof candidate['message'] === 'string' &&
    typeof candidate['correlationId'] === 'string'
  );
}
