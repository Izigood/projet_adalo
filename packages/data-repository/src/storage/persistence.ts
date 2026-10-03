/**
 * `persistent`: the browser will not clear the data under pressure. `best-effort`: it may
 * (Safari also clears after 7 days without a visit). `unsupported`: there is no way to ask.
 */
export type PersistenceState = 'persistent' | 'best-effort' | 'unsupported';

export type StorageManagerLike = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

/**
 * Asks the browser for persistent storage (REC-01) and says where things stand. It never throws:
 * a browser that refuses, or fails, leaves the data best-effort, which the application must then
 * tell its user (RG-15) and back up by export.
 */
export async function requestPersistence(
  storage: StorageManagerLike | undefined = globalThis.navigator?.storage,
): Promise<PersistenceState> {
  if (storage === undefined || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'persistent';
    return (await storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}
