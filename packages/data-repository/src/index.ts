export const PACKAGE_NAME = '@acs/data-repository';

export {
  averageDecimals,
  canonicalDecimal,
  compareDecimals,
  decimalSortKey,
  sumDecimals,
} from './values/decimal.js';
export type { DecimalFormat, DecimalIssue } from './values/decimal.js';
export { checkFieldValue } from './values/field-value.js';
export type { ValueIssue, ValueRule } from './values/field-value.js';
export { MAX_PATTERN_LENGTH, safeRegExp } from './values/regex-safety.js';
export {
  buildLayout,
  deriveKeys,
  derivedKeyName,
  entityStoreName,
  junctionStoreName,
} from './storage/layout.js';
export type {
  DataLayout,
  DerivedKey,
  EntityLayout,
  FieldInfo,
  IndexInfo,
  StoreSpec,
} from './storage/layout.js';
export {
  databaseName,
  openEnvironment,
  purgeEnvironment,
  storageError,
} from './storage/database.js';
export type {
  DataEnvironment,
  IndexedDbSource,
  OpenEnvironment,
  OpenOptions,
} from './storage/database.js';
export { requestPersistence } from './storage/persistence.js';
export type { PersistenceState, StorageManagerLike } from './storage/persistence.js';
