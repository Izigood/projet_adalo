import type { DomainError } from '@acs/domain';
import type { Draft } from 'immer';
import type { ProjectState } from '../project/project-state.js';

/** A change to the project (dossier 7.2): what it is, with what, and how it reads in the history. */
export type DesignCommand<P = unknown> = {
  readonly type: `CMD-${string}`;
  readonly payload: P;
  /** Shown in the undo history. */
  readonly label: string;
};

/**
 * What a command does to a draft of the project. It returns nothing when it worked, or the error
 * that says why it could not: then nothing of it is kept. It must not return the draft itself.
 */
export type CommandHandler<P = never> = (
  draft: Draft<ProjectState>,
  payload: P,
) => DomainError | undefined;

/** The commands the bus knows, by type. */
export type CommandTable = Readonly<Record<string, CommandHandler>>;

/** Told after the bus has applied a change, for what listens to the project (autosave, validator). */
export type StudioEvent = {
  readonly type: 'EVT-PROJECT-CHANGED';
  readonly cause: 'loaded' | 'command' | 'undo' | 'redo' | 'closed';
  /** The label of the command, for `command`, `undo` and `redo`. */
  readonly label?: string;
};

export type StudioListener = (event: StudioEvent) => void;
