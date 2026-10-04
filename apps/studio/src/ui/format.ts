import { TRASH_RETENTION_DAYS } from '@acs/domain';
import type { CatalogEntry } from '@acs/domain';

const DAY_MS = 86_400_000;

/**
 * Days left before the trash lets go of a project, counted upward: 29 days and 1 hour left is 30,
 * the last hours are 1, and 0 means it goes the next time the catalogue is opened. Undefined for a
 * project that is not in the trash.
 */
export function daysUntilPurge(entry: CatalogEntry, now: string): number | undefined {
  if (entry.status !== 'trashed' || entry.trashedAt === undefined) return undefined;
  const left = Date.parse(entry.trashedAt) + TRASH_RETENTION_DAYS * DAY_MS - Date.parse(now);
  return Math.max(0, Math.ceil(left / DAY_MS));
}

/**
 * A date as a person reads it, in French: « 4 octobre 2026 à 10:00 ». The time zone is the
 * person's own, unless one is given (the tests give one: a date that depends on the machine cannot
 * be asserted).
 */
export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('fr', {
    dateStyle: 'long',
    timeStyle: 'short',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}
