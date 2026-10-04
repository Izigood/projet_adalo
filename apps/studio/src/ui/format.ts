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
