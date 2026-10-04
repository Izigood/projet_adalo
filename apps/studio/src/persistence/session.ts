import { domainError, err, ok } from '@acs/domain';
import type {
  CatalogEntry,
  DomainError,
  Id,
  PackageFiles,
  ProjectStore,
  RecoveryDraft,
  Result,
} from '@acs/domain';
import { validateFiles } from '@acs/project-schema';
import type { CommandBus } from '../commands/bus.js';
import { createProject } from '../project/create-project.js';
import type { NewProject } from '../project/create-project.js';
import { fromFiles, readFiles, summaryOf, toFiles } from '../project/project-state.js';
import type { ProjectView } from '../project/project-store.js';
import { createSaveStatus } from './save-status.js';
import type { SaveStatusView } from './save-status.js';

/** RG-13: the automatic save comes 2 seconds after the last command. */
export const AUTOSAVE_DELAY_MS = 2000;

/** Runs `run` after `ms` milliseconds; returns the function that cancels it. */
export type Scheduler = { after(ms: number, run: () => void): () => void };

const timers: Scheduler = {
  after(ms, run) {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};

export type SessionOptions = {
  readonly store: ProjectStore;
  readonly bus: CommandBus;
  readonly view: ProjectView;
  readonly scheduler?: Scheduler;
  /** An ISO 8601 UTC date-time. */
  readonly now?: () => string;
  readonly delayMs?: number;
};

export type ProjectSession = {
  /** Creates a project (EF-PRJ-01), stores it and opens it. */
  create(input: NewProject): Promise<Result<CatalogEntry, DomainError>>;
  /**
   * Opens a stored project; what was waiting to be saved in the one open is saved first. It opens
   * the project as it was saved; `draft` says there is a more recent recovery draft to take or leave.
   */
  open(id: Id): Promise<Result<OpenedProject, DomainError>>;
  /** Replaces the open project by its recovery draft, which is then saved as soon as it validates. */
  recover(): Promise<Result<void, DomainError>>;
  /** Throws the recovery draft away; the open project stays as it was saved. */
  dismissDraft(): Promise<Result<void, DomainError>>;
  /** Saves now what waits for the delay. */
  flush(): Promise<void>;
  /** Saves what waits, then closes the project. */
  close(): Promise<void>;
  readonly status: SaveStatusView;
};

/** A project that was opened, and the draft that could be taken back (what to show of it). */
export type OpenedProject = {
  readonly entry: CatalogEntry;
  readonly draft: { readonly savedAt: string; readonly issues: number } | null;
};

type Opened = { readonly id: Id; revision: number };

/** How many problems the structural validation finds in these files. */
function issuesIn(files: PackageFiles): number {
  const checked = validateFiles(files);
  return checked.ok ? 0 : (checked.error.details as { issues: readonly unknown[] }).issues.length;
}

/**
 * The open project and its store (RG-13, EF-PRJ-01): it saves 2 seconds after the last command, and
 * only when the project passes the structural validation; one that does not is kept as a recovery
 * draft, and the saved project stays as it was. The saves are one after the other: a change made
 * while one is on its way waits for it, then goes in the next, with the revision the first returned.
 */
export function createProjectSession(options: SessionOptions): ProjectSession {
  const { store, bus, view } = options;
  const scheduler = options.scheduler ?? timers;
  const now = options.now ?? (() => new Date().toISOString());
  const delay = options.delayMs ?? AUTOSAVE_DELAY_MS;
  const status = createSaveStatus();

  let opened: Opened | null = null;
  /** The recovery draft of the open project, offered and not yet taken or thrown away. */
  let pending: RecoveryDraft | null = null;
  let dirty = false;
  let cancel: (() => void) | undefined;
  let queue: Promise<void> = Promise.resolve();

  const stopTimer = () => {
    cancel?.();
    cancel = undefined;
  };

  /** The project changed: it will be saved once the delay has gone by without another change. */
  function markChanged(): void {
    dirty = true;
    status.set({ phase: 'unsaved' });
    stopTimer();
    cancel = scheduler.after(delay, () => void flush());
  }

  bus.listen((event) => {
    if (event.cause === 'loaded' || event.cause === 'closed') {
      stopTimer();
      dirty = false;
      return;
    }
    if (opened !== null) markChanged();
  });

  async function saveNow(): Promise<void> {
    const target = opened;
    const state = view.getState();
    if (!dirty || target === null || state === null) return;
    dirty = false;
    const files = toFiles(state);
    const checked = validateFiles(files);
    const at = now();

    if (!checked.ok) {
      const issues = (checked.error.details as { issues: readonly unknown[] }).issues.length;
      const kept = await store.saveDraft({
        projectId: target.id,
        savedAt: at,
        baseRevision: target.revision,
        files,
      });
      if (kept.ok) status.set({ phase: 'draft', issues });
      else {
        dirty = true;
        status.set({ phase: 'error', error: kept.error });
      }
      return;
    }

    status.set({ phase: 'saving' });
    const saved = await store.save(summaryOf(state), files, target.revision, at);
    if (!saved.ok) {
      dirty = true;
      status.set({
        phase: saved.error.code === 'VERSION_CONFLICT' ? 'conflict' : 'error',
        error: saved.error,
      });
      return;
    }
    target.revision = saved.value.revision;
    // A draft that is left behind is older than the save: opening the project drops it.
    await store.discardDraft(target.id);
    // Changes made during the save went through the listener, which put `unsaved` and a timer.
    if (!dirty) status.set({ phase: 'saved' });
  }

  function flush(): Promise<void> {
    stopTimer();
    queue = queue.then(saveNow);
    return queue;
  }

  const unknown = (id: string) =>
    domainError('CONSTRAINT_VIOLATION', `there is no project ${id}`, { details: { field: 'id' } });

  return {
    status: status.view,
    flush,

    async create(input) {
      await flush();
      const made = createProject(input);
      if (!made.ok) return made;
      const stored = await store.create(summaryOf(made.value), toFiles(made.value), now());
      if (!stored.ok) return stored;
      bus.load(made.value);
      opened = { id: stored.value.id, revision: stored.value.revision };
      pending = null;
      status.set({ phase: 'saved' });
      return stored;
    },

    async open(id) {
      await flush();
      const loaded = await store.load(id);
      if (!loaded.ok) return loaded;
      if (loaded.value === null) return err(unknown(id));
      const { entry, files } = loaded.value;
      const state = fromFiles(files);
      if (!state.ok) return state;
      // Read before anything is replaced: a store that fails here leaves the open project as it is.
      const drafted = await store.loadDraft(id);
      if (!drafted.ok) return drafted;
      // A draft older than the last save was written before it (a save that could not drop it):
      // what it holds is already in the project. One made at the same instant is kept: asking once
      // costs less than losing what was done.
      let draft = drafted.value;
      if (draft !== null && Date.parse(draft.savedAt) < Date.parse(entry.updatedAt)) {
        await store.discardDraft(id);
        draft = null;
      }
      bus.load(state.value);
      opened = { id, revision: entry.revision };
      pending = draft;
      status.set({ phase: 'saved' });
      return ok({
        entry,
        draft: draft === null ? null : { savedAt: draft.savedAt, issues: issuesIn(draft.files) },
      });
    },

    async recover() {
      if (pending === null || opened === null) {
        return err(
          domainError('CONSTRAINT_VIOLATION', 'there is no recovery draft to take back', {
            details: { field: 'draft' },
          }),
        );
      }
      const state = readFiles(pending.files);
      // A draft that cannot be read stays offered, so that it can be thrown away.
      if (!state.ok) return state;
      bus.load(state.value);
      pending = null;
      // Not saved: the draft is the work of the last session, and the saved project is older. It
      // goes the way of any change, a save if it validates, the draft again if it does not.
      markChanged();
      return ok(undefined);
    },

    async dismissDraft() {
      if (pending === null || opened === null) return ok(undefined);
      const discarded = await store.discardDraft(opened.id);
      if (discarded.ok) pending = null;
      return discarded;
    },

    async close() {
      await flush();
      bus.close();
      opened = null;
      pending = null;
      status.set({ phase: 'idle' });
    },
  };
}
