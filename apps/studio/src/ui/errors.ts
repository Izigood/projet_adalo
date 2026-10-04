import type { DomainError } from '@acs/domain';
import { t } from '../i18n.js';

/**
 * What the interface says of an error that came back from the store or the catalogue. The codes are
 * the business ones of dossier 7.7; the person is told what to understand and what to do, not the
 * code.
 */
export function errorMessage(error: DomainError): string {
  if (error.code === 'STORAGE_UNAVAILABLE' || error.code === 'STORAGE_QUOTA') {
    return t('error.storage');
  }
  if (error.code === 'CONSTRAINT_VIOLATION' && error.details?.['field'] === 'key') {
    return t('error.keyTaken');
  }
  return t('error.generic');
}
