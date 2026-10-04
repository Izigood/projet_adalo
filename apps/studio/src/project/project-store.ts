import { freeze } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { ProjectState } from './project-state.js';

/** What a component of the Studio can do with the open project: look at it, and be told. */
export type ProjectView = {
  /** The open project, or null. It is frozen: changing it in place throws. */
  getState(): ProjectState | null;
  /** Calls `listener` after each change; returns the function that stops it. */
  subscribe(listener: () => void): () => void;
};

/**
 * What only the command bus holds (ARC-STU-02): the way to put a project into the store. No
 * component is given it, so no component can change the project except by a command (§ 7.2).
 */
export type ProjectWriter = {
  /** Replaces the open project; deep-freezes it first. */
  replace(next: ProjectState): void;
  close(): void;
};

type Slice = { readonly project: ProjectState | null };

/** The Zustand store of the open project (ARC-STU-01), split into its two sides. */
export function createProjectStore(): { view: ProjectView; writer: ProjectWriter } {
  const store = createStore<Slice>(() => ({ project: null }));
  const view: ProjectView = {
    getState: () => store.getState().project,
    subscribe: (listener) => store.subscribe(listener),
  };
  const writer: ProjectWriter = {
    replace: (next) => store.setState({ project: freeze(next, true) }),
    close: () => store.setState({ project: null }),
  };
  return { view, writer };
}
