/**
 * The names of the backups taken before a migration. A backup is a data base of its own, named
 * after the one it was taken from: `acs-data-{key}-{env}-backup-{yyyymmddhhmmss}` (and `-2`, `-3`
 * when several are taken in the same second). The environment is in the name, so a name says which
 * environment a backup belongs to, and a purge or a restore can tell its own from another's.
 */
export const backupPrefix = (databaseName: string): string => `${databaseName}-backup-`;

export function backupName(databaseName: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${backupPrefix(databaseName)}${stamp}`;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether `candidate` is the name of a backup of the data base `databaseName`, and of no other. */
export function isBackupOf(databaseName: string, candidate: string): boolean {
  return new RegExp(`^${escape(backupPrefix(databaseName))}\\d{14}(?:-\\d+)?$`).test(candidate);
}
