import type { DomainError } from '@acs/domain';
import { createStore } from 'zustand/vanilla';

/**
 * Where the open project stands with the store: `unsaved` (changes wait for the delay), `saving`,
 * `saved`, `draft` (the project does not pass the structural validation, so what was done is kept as
 * a recovery draft and the saved project is untouched, RG-13), `conflict` (another tab saved the
 * project first) and `error` (the store failed: the changes are kept and tried again).
 */
export type SavePhase = 'idle' | 'unsaved' | 'saving' | 'saved' | 'draft' | 'conflict' | 'error';

export type SaveStatus = {
  readonly phase: SavePhase;
  /** For `draft`: how many problems the validation found. */
  readonly issues?: number;
  /** For `conflict` and `error`. */
  readonly error?: DomainError;
};

export type SaveStatusView = {
  getState(): SaveStatus;
  subscribe(listener: () => void): () => void;
};

export function createSaveStatus(): {
  view: SaveStatusView;
  set(next: SaveStatus): void;
} {
  const store = createStore<SaveStatus>(() => ({ phase: 'idle' }));
  return {
    view: { getState: store.getState, subscribe: store.subscribe },
    // Replace, not merge: a phase brings its own details and leaves none of the previous one's.
    set: (next) => store.setState(next, true),
  };
}
