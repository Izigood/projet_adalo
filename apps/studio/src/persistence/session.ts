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
import { createStore } from 'zustand/vanilla';
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
  /** The project that is open, if any. */
  current(): Id | null;
  /** Saves now what waits for the delay. */
  flush(): Promise<void>;
  /**
   * Closes the project, once what waits is saved, or kept as a recovery draft when it cannot be saved.
   * It refuses, and the project stays open, when the changes can be neither saved nor kept.
   */
  close(): Promise<Result<void, DomainError>>;
  readonly status: SaveStatusView;
  /** The recovery draft on offer for the open project, or null: what the interface shows. */
  readonly draft: DraftOfferView;
};

/** What is shown of a recovery draft on offer: when it was made, and how many problems it has. */
export type DraftOffer = { readonly savedAt: string; readonly issues: number };

export type DraftOfferView = {
  getState(): DraftOffer | null;
  subscribe(listener: () => void): () => void;
};

/** A project that was opened, and the draft that could be taken back (what to show of it). */
export type OpenedProject = {
  readonly entry: CatalogEntry;
  readonly draft: DraftOffer | null;
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

  const offer = createStore<DraftOffer | null>(() => null);

  let opened: Opened | null = null;
  /** The recovery draft of the open project, offered and not yet taken or thrown away. */
  let pending: RecoveryDraft | null = null;

  /** Keeps the draft on offer and tells the interface of it, from one place. */
  function setPending(draft: RecoveryDraft | null): void {
    pending = draft;
    offer.setState(
      draft === null ? null : { savedAt: draft.savedAt, issues: issuesIn(draft.files) },
      true,
    );
  }
  let dirty = false;
  /** Counts the changes made to the open project: a wait can tell whether any came meanwhile. */
  let changes = 0;
  let cancel: (() => void) | undefined;
  let queue: Promise<void> = Promise.resolve();

  const stopTimer = () => {
    cancel?.();
    cancel = undefined;
  };

  /** The project changed: it will be saved once the delay has gone by without another change. */
  function markChanged(): void {
    dirty = true;
    changes += 1;
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
    if (opened === null) return;
    // Working on the saved project is not taking the draft back: the offer goes from the screen, and
    // the draft stays in the store until a save or another draft takes its place.
    if (event.cause === 'command' && pending !== null) setPending(null);
    markChanged();
  });

  async function saveNow(): Promise<void> {
    try {
      await trySave();
    } catch (cause) {
      // A store that throws instead of answering: the changes are kept, and the saves go on.
      dirty = true;
      status.set({
        phase: 'error',
        error: domainError('STORAGE_UNAVAILABLE', 'the save failed', {
          details: { cause: String(cause) },
        }),
      });
    }
  }

  async function trySave(): Promise<void> {
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

  /**
   * Gets the open project ready to be left: what waits is saved; what cannot be saved (the store
   * fails, another tab saved first) is kept as a recovery draft; and when it can be neither, the
   * project is not left. A change that comes while this waits is looked after in its turn, so that
   * nothing is dropped between the last look and the moment the project is replaced.
   */
  async function release(): Promise<Result<void, DomainError>> {
    for (;;) {
      const before = changes;
      await flush();
      if (!dirty) return ok(undefined);
      // It changed while it was being saved: save again. Otherwise the save itself failed.
      if (changes === before) break;
    }
    for (;;) {
      const seen = changes;
      const target = opened;
      const state = view.getState();
      if (target === null || state === null) {
        dirty = false;
        return ok(undefined);
      }
      let kept: Result<void, DomainError>;
      try {
        kept = await store.saveDraft({
          projectId: target.id,
          savedAt: now(),
          baseRevision: target.revision,
          files: toFiles(state),
        });
      } catch (cause) {
        kept = err(
          domainError('STORAGE_UNAVAILABLE', 'the draft could not be kept', {
            details: { cause: String(cause) },
          }),
        );
      }
      if (!kept.ok) {
        status.set({ phase: 'error', error: kept.error });
        return kept;
      }
      if (changes === seen) {
        dirty = false;
        return ok(undefined);
      }
    }
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
    draft: { getState: offer.getState, subscribe: offer.subscribe },
    flush,
    current: () => opened?.id ?? null,

    async create(input) {
      const made = createProject(input);
      if (!made.ok) return made;
      const left = await release();
      if (!left.ok) return left;
      const stored = await store.create(summaryOf(made.value), toFiles(made.value), now());
      if (!stored.ok) return stored;
      // A change made while the new project was being stored is looked after before it replaces
      // the open one (should that fail, the new project is in the catalogue, and not opened).
      while (dirty) {
        const again = await release();
        if (!again.ok) return again;
      }
      bus.load(made.value);
      opened = { id: stored.value.id, revision: stored.value.revision };
      setPending(null);
      status.set({ phase: 'saved' });
      return stored;
    },

    async open(id) {
      for (;;) {
        const left = await release();
        if (!left.ok) return left;
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
        // The open project changed while this was being read (possibly the very one being opened,
        // which would then be read out of date): look after the change, and read again.
        if (dirty) continue;
        bus.load(state.value);
        opened = { id, revision: entry.revision };
        setPending(draft);
        status.set({ phase: 'saved' });
        return ok({ entry, draft: offer.getState() });
      }
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
      setPending(null);
      // Not saved: the draft is the work of the last session, and the saved project is older. It
      // goes the way of any change, a save if it validates, the draft again if it does not.
      markChanged();
      return ok(undefined);
    },

    async dismissDraft() {
      if (pending === null || opened === null) return ok(undefined);
      const discarded = await store.discardDraft(opened.id);
      if (discarded.ok) setPending(null);
      return discarded;
    },

    async close() {
      const left = await release();
      if (!left.ok) return left;
      bus.close();
      opened = null;
      setPending(null);
      status.set({ phase: 'idle' });
      return ok(undefined);
    },
  };
}
