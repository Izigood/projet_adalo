import type { DomainError, Result } from '@acs/domain';
import { ok } from '@acs/domain';
import { applyPatches, enablePatches, produceWithPatches } from 'immer';
import type { Patch } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { ProjectState } from '../project/project-state.js';
import type { ProjectView, ProjectWriter } from '../project/project-store.js';
import type { CommandHandler, CommandTable, DesignCommand, StudioListener } from './command.js';
import { PROJECT_COMMANDS } from './project-commands.js';

enablePatches();

/** Commands kept to undo (EF-UI-06 asks for 200 at least; ADR-0037). */
export const HISTORY_LIMIT = 500;

export type HistorySnapshot = {
  /** Labels of the commands that can be undone, the oldest first. */
  readonly undo: readonly string[];
  /** Labels of the commands that can be redone, the next one last. */
  readonly redo: readonly string[];
};

export type HistoryView = {
  getState(): HistorySnapshot;
  subscribe(listener: () => void): () => void;
};

export type CommandBus = {
  /** Applies the command; `changed` is false (and nothing is kept) when it changed nothing. */
  execute(command: DesignCommand): Result<{ readonly changed: boolean }, DomainError>;
  undo(): boolean;
  redo(): boolean;
  /** Puts a project in the store and forgets the history of the previous one. */
  load(project: ProjectState): void;
  close(): void;
  readonly history: HistoryView;
  /** Subscribes to the events; returns the function that stops it. */
  listen(listener: StudioListener): () => void;
};

type Entry = {
  readonly label: string;
  readonly patches: readonly Patch[];
  readonly inverse: readonly Patch[];
};

export type BusOptions = {
  readonly commands?: CommandTable;
  readonly limit?: number;
};

/**
 * The bus of commands (ARC-STU-02, dossier 7.2): the one way the open project changes. A command
 * runs on an Immer draft, and the patches it made and their inverse are what the history keeps, so
 * that no command writes an `undo`. A listener that throws stops the other listeners of that event:
 * the change and the history are already complete when the events go out.
 */
export function createCommandBus(
  store: { readonly view: ProjectView; readonly writer: ProjectWriter },
  options: BusOptions = {},
): CommandBus {
  const commands = options.commands ?? PROJECT_COMMANDS;
  const limit = options.limit ?? HISTORY_LIMIT;
  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];
  const history = createStore<HistorySnapshot>(() => ({ undo: [], redo: [] }));
  const listeners = new Set<StudioListener>();

  const publish = () =>
    history.setState({
      undo: undoStack.map((entry) => entry.label),
      redo: redoStack.map((entry) => entry.label),
    });
  const emit = (cause: 'loaded' | 'command' | 'undo' | 'redo' | 'closed', label?: string) => {
    for (const listener of [...listeners]) {
      listener(
        label === undefined
          ? { type: 'EVT-PROJECT-CHANGED', cause }
          : { type: 'EVT-PROJECT-CHANGED', cause, label },
      );
    }
  };
  const current = (): ProjectState => {
    const state = store.view.getState();
    if (state === null) throw new Error('no project is open');
    return state;
  };

  return {
    execute(command) {
      const handler = commands[command.type] as CommandHandler<unknown> | undefined;
      if (handler === undefined) throw new Error(`unknown command ${command.type}`);
      const outcome: { error?: DomainError } = {};
      const [next, patches, inverse] = produceWithPatches(current(), (draft) => {
        const error = handler(draft, command.payload);
        if (error !== undefined) outcome.error = error;
      });
      if (outcome.error !== undefined) return { ok: false, error: outcome.error };
      if (patches.length === 0) return ok({ changed: false });
      store.writer.replace(next);
      undoStack.push({ label: command.label, patches, inverse });
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
      publish();
      emit('command', command.label);
      return ok({ changed: true });
    },
    undo() {
      const entry = undoStack.pop();
      if (entry === undefined) return false;
      store.writer.replace(applyPatches(current(), [...entry.inverse]));
      redoStack.push(entry);
      publish();
      emit('undo', entry.label);
      return true;
    },
    redo() {
      const entry = redoStack.pop();
      if (entry === undefined) return false;
      store.writer.replace(applyPatches(current(), [...entry.patches]));
      undoStack.push(entry);
      publish();
      emit('redo', entry.label);
      return true;
    },
    load(project) {
      undoStack.length = 0;
      redoStack.length = 0;
      store.writer.replace(project);
      publish();
      emit('loaded');
    },
    close() {
      undoStack.length = 0;
      redoStack.length = 0;
      store.writer.close();
      publish();
      emit('closed');
    },
    history: { getState: history.getState, subscribe: history.subscribe },
    listen(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
