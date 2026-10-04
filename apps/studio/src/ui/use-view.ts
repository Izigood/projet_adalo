import { useSyncExternalStore } from 'react';

/** Anything with a stable `getState` and a `subscribe`: the views of the project, history, status. */
export type View<T> = {
  getState(): T;
  subscribe(listener: () => void): () => void;
};

/** The current state of a view; the component renders again when it changes. */
export function useView<T>(view: View<T>): T {
  return useSyncExternalStore(view.subscribe, view.getState);
}
