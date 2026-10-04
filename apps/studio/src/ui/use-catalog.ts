import { ok } from '@acs/domain';
import type { CatalogEntry, DomainError, Result } from '@acs/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogQuery } from '../catalog/query.js';
import { useServices } from './services-context.js';

export type CatalogListing = {
  readonly entries: readonly CatalogEntry[];
  /** Why the catalogue could not be read or changed, if it could not. */
  readonly error: DomainError | null;
  /** How many projects the trash let go of since the catalogue was opened. */
  readonly purged: number;
  /** Reads the list again, with the query of the moment: after a change. */
  refresh(): Promise<void>;
  /** Sets the error shown, for a change that was refused. */
  fail(error: DomainError | null): void;
};

/**
 * The catalogue as a screen reads it. Opening it lets go of what the trash has kept for 30 days
 * (and counts it); every later query only reads. Answers come back in any order, so one that is no
 * longer the last asked is dropped: the list shown is always the one of the query shown.
 */
export function useCatalog(query: CatalogQuery): CatalogListing {
  const { catalog } = useServices();
  const [entries, setEntries] = useState<readonly CatalogEntry[]>([]);
  const [error, setError] = useState<DomainError | null>(null);
  const [purged, setPurged] = useState(0);
  const asked = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const opened = useRef(false);
  /** False once the screen is gone: an answer that comes back then has nobody to tell. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(
    async (first: boolean) => {
      const sequence = ++asked.current;
      let listing: Result<readonly CatalogEntry[], DomainError>;
      if (first) {
        const view = await catalog.open(queryRef.current);
        // What the trash let go of is counted whatever became of the question that found out.
        if (alive.current && view.ok && view.value.purged.length > 0) {
          const gone = view.value.purged.length;
          setPurged((count) => count + gone);
        }
        listing = view.ok ? ok(view.value.entries) : view;
      } else {
        listing = await catalog.list(queryRef.current);
      }
      if (!alive.current || sequence !== asked.current) return;
      if (!listing.ok) {
        setError(listing.error);
        return;
      }
      setError(null);
      setEntries(listing.value);
    },
    [catalog],
  );

  const key = JSON.stringify(query);
  useEffect(() => {
    const first = !opened.current;
    opened.current = true;
    void read(first);
  }, [key, read]);

  return { entries, error, purged, refresh: () => read(false), fail: setError };
}
