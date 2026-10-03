/**
 * Tells whoever listens which stores a committed write touched, so that what observes a query
 * can read it again. It lives inside one open data base: another tab of the same application is
 * not told (a later step could relay it with a BroadcastChannel).
 */
export type ChangeBus = {
  subscribe(listener: (stores: ReadonlySet<string>) => void): () => void;
  notify(stores: ReadonlySet<string>): void;
};

export function createChangeBus(): ChangeBus {
  const listeners = new Set<(stores: ReadonlySet<string>) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(stores) {
      if (stores.size === 0) return;
      for (const listener of [...listeners]) listener(stores);
    },
  };
}
