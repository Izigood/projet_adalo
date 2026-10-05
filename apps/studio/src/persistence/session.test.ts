import { createLocalProjectStore } from '@acs/data-repository';
import { domainError, err } from '@acs/domain';
import type { Id, ProjectStore } from '@acs/domain';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createCommandBus } from '../commands/bus.js';
import { pageAdd, pageMove, pageRename } from '../commands/page-commands.js';
import { projectUpdate } from '../commands/project-commands.js';
import { toFiles } from '../project/project-state.js';
import { createProjectStore } from '../project/project-store.js';
import { AUTOSAVE_DELAY_MS, createProjectSession } from './session.js';
import type { Scheduler } from './session.js';

/** A clock the test turns by hand: the delay of RG-13 is a number to read, not time to wait. */
function manualScheduler() {
  const pending: { ms: number; run: () => void; live: boolean }[] = [];
  const scheduler: Scheduler = {
    after(ms, run) {
      const timer = { ms, run, live: true };
      pending.push(timer);
      return () => {
        timer.live = false;
      };
    },
  };
  const live = () => pending.filter((timer) => timer.live);
  return {
    scheduler,
    live,
    /** Lets the delay of the last timer go by. */
    fire() {
      const timer = live().at(-1);
      if (timer === undefined) throw new Error('no timer is waiting');
      timer.live = false;
      timer.run();
    },
  };
}

const AT = '2026-10-04T10:00:00.000Z';

function studio(options: { store?: ProjectStore } = {}) {
  const store =
    options.store ?? createLocalProjectStore({ indexedDB: new IDBFactory(), IDBKeyRange });
  const project = createProjectStore();
  const bus = createCommandBus(project);
  const clock = manualScheduler();
  const session = createProjectSession({
    store,
    bus,
    view: project.view,
    scheduler: clock.scheduler,
    now: () => AT,
  });
  const name = () => project.view.getState()?.project.name;
  const state = () => {
    const open = project.view.getState();
    if (open === null) throw new Error('no project');
    return open;
  };
  return { store, project, bus, clock, session, name, state };
}

async function created() {
  const made = studio();
  const entry = await made.session.create({ key: 'DEMO', name: 'Demo' });
  if (!entry.ok) throw new Error(entry.error.message);
  return { ...made, id: entry.value.id };
}

const stored = async (store: ProjectStore, id: Id) => {
  const loaded = await store.load(id);
  if (!loaded.ok || loaded.value === null) throw new Error('not stored');
  return loaded.value;
};

describe('creating and opening a project (EF-PRJ-01)', () => {
  it('stores the project at revision 1, opens it, and says it is saved', async () => {
    const { store, session, state, id } = await created();
    const found = await stored(store, id);
    expect(found.entry).toMatchObject({ key: 'DEMO', name: 'Demo', revision: 1, status: 'active' });
    expect(found.files).toEqual(toFiles(state()));
    expect(session.status.getState()).toEqual({ phase: 'saved' });
  });

  it('says which project is open: the one created or opened, and none once it is closed', async () => {
    const { session, store, id } = await created();
    expect(session.current()).toBe(id);
    const other = await session.create({ key: 'OTHER', name: 'Autre' });
    expect(session.current()).toBe(other.ok ? other.value.id : null);
    expect(session.current()).not.toBe(id);
    await session.open(id);
    expect(session.current()).toBe(id);
    const failed = await session.open('01920000-0000-7000-8000-00000000dead' as Id);
    expect(failed.ok).toBe(false);
    expect(session.current()).toBe(id);
    await session.close();
    expect(session.current()).toBeNull();
    expect(await store.list()).toMatchObject({ ok: true });
  });

  it('refuses what cannot be a project, and a key that is taken, and opens nothing', async () => {
    const { session, bus, state } = await created();
    const before = structuredClone(toFiles(state()));
    const bad = await session.create({ key: 'demo', name: 'Demo' });
    expect(bad.ok ? '' : bad.error.code).toBe('MANIFEST_INVALID');
    const taken = await session.create({ key: 'DEMO', name: 'Autre' });
    expect(taken.ok ? '' : taken.error.code).toBe('CONSTRAINT_VIOLATION');
    expect(toFiles(state())).toEqual(before);
    expect(bus.history.getState().undo).toEqual([]);
  });

  it('opens a stored project as it was saved, and refuses one that does not exist', async () => {
    const first = await created();
    first.bus.execute(projectUpdate({ name: 'Renamed' }));
    await first.session.flush();
    const again = studio({ store: first.store });
    expect((await again.session.open(first.id)).ok).toBe(true);
    expect(again.state()).toEqual(first.state());
    const ghost = await again.session.open('01920000-0000-7000-8000-00000000dead' as Id);
    expect(ghost.ok ? '' : ghost.error.code).toBe('CONSTRAINT_VIOLATION');
    expect(again.state()).toEqual(first.state());
  });
});

describe('the automatic save (RG-13)', () => {
  it('waits 2 seconds after the last command, and saves once for a burst of commands', async () => {
    const { store, session, bus, clock, id, name } = await created();
    bus.execute(projectUpdate({ name: 'Un' }));
    bus.execute(projectUpdate({ name: 'Deux' }));
    bus.execute(projectUpdate({ name: 'Trois' }));
    expect(clock.live()).toHaveLength(1);
    expect(clock.live()[0]?.ms).toBe(AUTOSAVE_DELAY_MS);
    expect(AUTOSAVE_DELAY_MS).toBe(2000);
    expect((await stored(store, id)).entry).toMatchObject({ name: 'Demo', revision: 1 });
    expect(session.status.getState()).toEqual({ phase: 'unsaved' });

    clock.fire();
    await session.flush();
    expect((await stored(store, id)).entry).toMatchObject({ name: 'Trois', revision: 2 });
    expect(name()).toBe('Trois');
    expect(session.status.getState()).toEqual({ phase: 'saved' });
  });

  it('saves what undo and redo give, as it saves a command', async () => {
    const { store, session, bus, id } = await created();
    bus.execute(projectUpdate({ name: 'Un' }));
    await session.flush();
    bus.undo();
    await session.flush();
    expect((await stored(store, id)).entry).toMatchObject({ name: 'Demo', revision: 3 });
    bus.redo();
    await session.flush();
    expect((await stored(store, id)).entry).toMatchObject({ name: 'Un', revision: 4 });
  });

  it('saves nothing when nothing has changed', async () => {
    const { store, session, id } = await created();
    await session.flush();
    expect((await stored(store, id)).entry.revision).toBe(1);
  });

  it('does not save a project that fails the structural validation: it keeps a recovery draft', async () => {
    const { store, session, bus, state, id } = await created();
    const home = state().initialPageId;
    bus.execute(pageRename({ pageId: home, key: 'Not A Key' }));
    await session.flush();

    const found = await stored(store, id);
    expect(found.entry.revision).toBe(1);
    expect(found.files).not.toEqual(toFiles(state()));
    const draft = await store.loadDraft(id);
    expect(draft.ok && draft.value).toMatchObject({
      projectId: id,
      savedAt: AT,
      baseRevision: 1,
    });
    expect(draft.ok && draft.value?.files).toEqual(toFiles(state()));
    const status = session.status.getState();
    expect(status.phase).toBe('draft');
    expect(status.issues).toBeGreaterThanOrEqual(1);
  });

  it('saves the project once it is valid again, and drops the draft', async () => {
    const { store, session, bus, state, id } = await created();
    const home = state().initialPageId;
    bus.execute(pageRename({ pageId: home, key: 'Not A Key' }));
    await session.flush();
    bus.execute(pageRename({ pageId: home, key: 'accueil' }));
    await session.flush();

    expect((await stored(store, id)).entry.revision).toBe(2);
    expect(await store.loadDraft(id)).toEqual({ ok: true, value: null });
    expect(session.status.getState()).toEqual({ phase: 'saved' });
  });

  it('puts the saves one after the other: a change made during a save waits for it', async () => {
    const source = { indexedDB: new IDBFactory(), IDBKeyRange };
    const real = createLocalProjectStore(source);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let running = 0;
    let most = 0;
    const revisions: number[] = [];
    const slow: ProjectStore = {
      ...real,
      async save(summary, files, expected, at) {
        running += 1;
        most = Math.max(most, running);
        revisions.push(expected);
        if (revisions.length === 1) await gate;
        const result = await real.save(summary, files, expected, at);
        running -= 1;
        return result;
      },
    };
    const { session, bus, id } = await (async () => {
      const made = studio({ store: slow });
      const entry = await made.session.create({ key: 'DEMO', name: 'Demo' });
      if (!entry.ok) throw new Error(entry.error.message);
      return { ...made, id: entry.value.id };
    })();

    bus.execute(projectUpdate({ name: 'Un' }));
    const first = session.flush();
    await Promise.resolve();
    bus.execute(projectUpdate({ name: 'Deux' }));
    const second = session.flush();
    release();
    await Promise.all([first, second]);

    expect(most).toBe(1);
    expect(revisions).toEqual([1, 2]);
    expect((await stored(real, id)).entry).toMatchObject({ name: 'Deux', revision: 3 });
  });

  it('says unsaved, not saved, when the project changed while it was being saved', async () => {
    const real = createLocalProjectStore({ indexedDB: new IDBFactory(), IDBKeyRange });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: ProjectStore = {
      ...real,
      save: async (summary, files, expected, at) => {
        await gate;
        return real.save(summary, files, expected, at);
      },
    };
    const made = studio({ store: slow });
    const entry = await made.session.create({ key: 'DEMO', name: 'Demo' });
    if (!entry.ok) throw new Error(entry.error.message);

    made.bus.execute(projectUpdate({ name: 'Un' }));
    const first = made.session.flush();
    await Promise.resolve();
    expect(made.session.status.getState()).toEqual({ phase: 'saving' });
    made.bus.execute(projectUpdate({ name: 'Deux' }));
    release();
    await first;
    expect(made.session.status.getState()).toEqual({ phase: 'unsaved' });
    expect(made.clock.live()).toHaveLength(1);

    made.clock.fire();
    await made.session.flush();
    expect(made.session.status.getState()).toEqual({ phase: 'saved' });
    expect((await stored(real, entry.value.id)).entry.name).toBe('Deux');
  });

  it('says there is a conflict when another tab saved first, and keeps what the other tab saved', async () => {
    const { store, session, bus, id } = await created();
    const other = await stored(store, id);
    const tab = await store.save(
      { ...other.entry, name: 'Other tab' },
      other.files,
      other.entry.revision,
      AT,
    );
    expect(tab.ok).toBe(true);
    bus.execute(projectUpdate({ name: 'Mine' }));
    await session.flush();
    const status = session.status.getState();
    expect(status.phase).toBe('conflict');
    expect(status.error?.code).toBe('VERSION_CONFLICT');
    expect((await stored(store, id)).entry.name).toBe('Other tab');
  });

  it('keeps the changes when the store fails, says so, and saves them the next time', async () => {
    const source = { indexedDB: new IDBFactory(), IDBKeyRange };
    const real = createLocalProjectStore(source);
    let failing = true;
    const flaky: ProjectStore = {
      ...real,
      save: (summary, files, expected, at) =>
        failing
          ? Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk')))
          : real.save(summary, files, expected, at),
    };
    const made = studio({ store: flaky });
    const entry = await made.session.create({ key: 'DEMO', name: 'Demo' });
    if (!entry.ok) throw new Error(entry.error.message);
    made.bus.execute(projectUpdate({ name: 'Un' }));
    await made.session.flush();
    expect(made.session.status.getState().phase).toBe('error');
    expect((await stored(real, entry.value.id)).entry.name).toBe('Demo');

    // The change is still waiting: asking again saves it, without any new command.
    failing = false;
    await made.session.flush();
    const saved = await stored(real, entry.value.id);
    expect(saved.entry).toMatchObject({ name: 'Un', revision: 2 });
    expect(made.session.status.getState()).toEqual({ phase: 'saved' });
  });

  it('saves what waits before another project is opened, and before the project is closed', async () => {
    const { store, session, bus, clock, id } = await created();
    bus.execute(projectUpdate({ name: 'Demo avant' }));
    const second = await session.create({ key: 'OTHER', name: 'Autre' });
    expect(second.ok).toBe(true);
    bus.execute(projectUpdate({ name: 'Autre modifié' }));
    await session.open(id);
    expect(clock.live()).toHaveLength(0);
    const all = await store.list();
    expect(all.ok && all.value.map((entry) => entry.name).sort()).toEqual([
      'Autre modifié',
      'Demo avant',
    ]);

    bus.execute(projectUpdate({ name: 'Demo modifié' }));
    await session.close();
    expect((await stored(store, id)).entry.name).toBe('Demo modifié');
    expect(session.status.getState()).toEqual({ phase: 'idle' });
    expect(clock.live()).toHaveLength(0);
  });
});

/** A tab that leaves a recovery draft behind (an invalid project) and is closed without a word. */
async function withDraft() {
  const tab = await created();
  tab.bus.execute(pageRename({ pageId: tab.state().initialPageId, key: 'Not A Key' }));
  await tab.session.flush();
  const drafted = structuredClone(toFiles(tab.state()));
  const next = studio({ store: tab.store });
  return { ...tab, drafted, next };
}

const draftOf = async (store: ProjectStore, id: Id) => {
  const loaded = await store.loadDraft(id);
  if (!loaded.ok) throw new Error(loaded.error.message);
  return loaded.value;
};

describe('the recovery draft, offered when the project is opened again (RG-13)', () => {
  it('opens the project as it was saved, and says there is a draft that is more recent', async () => {
    const { store, next, id } = await withDraft();
    const opened = await next.session.open(id);
    expect(opened.ok && opened.value.draft).toMatchObject({ savedAt: AT });
    expect(opened.ok && (opened.value.draft?.issues ?? 0)).toBeGreaterThanOrEqual(1);
    expect(toFiles(next.state())).toEqual((await stored(store, id)).files);
    expect(next.state().pages.byId[next.state().initialPageId]?.key).toBe('home');
  });

  it('takes the draft back on request: the work of the last session, not yet saved', async () => {
    const { store, next, drafted, state, id } = await withDraft();
    await next.session.open(id);
    expect((await next.session.recover()).ok).toBe(true);
    expect(next.state()).toEqual(state());
    expect(toFiles(next.state())).toEqual(drafted);
    expect(next.session.status.getState()).toEqual({ phase: 'unsaved' });
    expect((await stored(store, id)).entry.revision).toBe(1);

    next.clock.fire();
    await next.session.flush();
    expect(next.session.status.getState().phase).toBe('draft');
    expect((await stored(store, id)).entry.revision).toBe(1);
    expect(await draftOf(store, id)).not.toBeNull();

    next.bus.execute(pageRename({ pageId: next.state().initialPageId, key: 'accueil' }));
    await next.session.flush();
    expect((await stored(store, id)).entry.revision).toBe(2);
    expect(await draftOf(store, id)).toBeNull();
    expect(next.session.status.getState()).toEqual({ phase: 'saved' });
  });

  it('throws the draft away on request, and does not offer it again', async () => {
    const { store, next, id } = await withDraft();
    await next.session.open(id);
    expect((await next.session.dismissDraft()).ok).toBe(true);
    expect(await draftOf(store, id)).toBeNull();
    expect((await next.session.dismissDraft()).ok).toBe(true);
    const again = studio({ store });
    const opened = await again.session.open(id);
    expect(opened.ok && opened.value.draft).toBeNull();
    expect(again.state().pages.byId[again.state().initialPageId]?.key).toBe('home');
  });

  it.each([
    ['older than the last save', '2026-10-03T10:00:00.000Z', false],
    ['made at the same instant as the last save', AT, true],
    ['more recent than the last save', '2026-10-05T10:00:00.000Z', true],
  ])('a draft %s is %s offered', async (_label, savedAt, offered) => {
    const { store, session, id } = await created();
    const kept = await store.saveDraft({
      projectId: id,
      savedAt,
      baseRevision: 1,
      files: (await stored(store, id)).files,
    });
    expect(kept.ok).toBe(true);
    const opened = await session.open(id);
    expect(opened.ok && opened.value.draft !== null).toBe(offered);
    if (!offered) expect(await draftOf(store, id)).toBeNull();
  });

  it('has nothing to take back when there is no draft, or when it was taken or the project was closed', async () => {
    const { next, session, id } = await withDraft();
    expect((await session.recover()).ok).toBe(false);
    await next.session.open(id);
    expect((await next.session.recover()).ok).toBe(true);
    const twice = await next.session.recover();
    expect(twice.ok ? '' : twice.error.details).toEqual({ field: 'draft' });

    const other = studio({ store: next.store });
    await other.session.open(id);
    await other.session.close();
    expect((await other.session.recover()).ok).toBe(false);
  });

  it('does not put the draft of one project into another: opening or creating drops the offer', async () => {
    const { next, id } = await withDraft();
    const second = await next.session.create({ key: 'OTHER', name: 'Autre' });
    expect(second.ok).toBe(true);

    // The draft is offered for the first project; a new project is created instead.
    const opened = await next.session.open(id);
    expect(opened.ok && opened.value.draft).not.toBeNull();
    const third = await next.session.create({ key: 'THIRD', name: 'Troisième' });
    expect(third.ok).toBe(true);
    const refused = await next.session.recover();
    expect(refused.ok).toBe(false);
    expect(next.name()).toBe('Troisième');

    // And a project with no draft of its own is opened instead.
    await next.session.open(id);
    const again = await next.session.open(second.ok ? second.value.id : id);
    expect(again.ok && again.value.draft).toBeNull();
    expect((await next.session.recover()).ok).toBe(false);
    expect(next.name()).toBe('Autre');
  });

  it('keeps offering a draft it cannot read, so that it can be thrown away', async () => {
    const { store, session, state, id } = await created();
    await store.saveDraft({
      projectId: id,
      savedAt: '2026-10-05T10:00:00.000Z',
      baseRevision: 1,
      files: {},
    });
    const opened = await session.open(id);
    expect(opened.ok && opened.value.draft).not.toBeNull();
    const before = structuredClone(toFiles(state()));
    const recovered = await session.recover();
    expect(recovered.ok ? '' : recovered.error.code).toBe('MANIFEST_INVALID');
    expect(toFiles(state())).toEqual(before);
    expect((await session.dismissDraft()).ok).toBe(true);
    expect(await draftOf(store, id)).toBeNull();
  });

  it('does not open the project when its draft cannot be read, and leaves the open one alone', async () => {
    const real = createLocalProjectStore({ indexedDB: new IDBFactory(), IDBKeyRange });
    const broken: ProjectStore = {
      ...real,
      loadDraft: () => Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk'))),
    };
    const made = studio({ store: broken });
    const first = await made.session.create({ key: 'AA', name: 'Premier' });
    const second = await made.session.create({ key: 'BB', name: 'Second' });
    if (!first.ok || !second.ok) throw new Error('not created');
    const opened = await made.session.open(first.value.id);
    expect(opened.ok ? '' : opened.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(made.name()).toBe('Second');
  });

  it('keeps the draft offered when it cannot be thrown away', async () => {
    const { store, id } = await withDraft();
    const stuck: ProjectStore = {
      ...store,
      discardDraft: () => Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk'))),
    };
    const next = studio({ store: stuck });
    await next.session.open(id);
    const dismissed = await next.session.dismissDraft();
    expect(dismissed.ok ? '' : dismissed.error.code).toBe('STORAGE_UNAVAILABLE');
    expect((await next.session.recover()).ok).toBe(true);
  });
});

describe('the draft on offer, for the interface', () => {
  it('is none to begin with, the draft when a project with one is opened, and none once it is taken or thrown away', async () => {
    const { next, id } = await withDraft();
    expect(next.session.draft.getState()).toBeNull();
    await next.session.open(id);
    const offer = next.session.draft.getState();
    expect(offer?.savedAt).toBe(AT);
    expect(offer?.issues).toBeGreaterThanOrEqual(1);
    expect((await next.session.recover()).ok).toBe(true);
    expect(next.session.draft.getState()).toBeNull();

    const again = studio({ store: next.store });
    await again.session.open(id);
    expect(again.session.draft.getState()).not.toBeNull();
    await again.session.dismissDraft();
    expect(again.session.draft.getState()).toBeNull();
  });

  it('is kept when the draft cannot be taken back or thrown away, and dropped by create and close', async () => {
    const { store, next, id } = await withDraft();
    await next.session.open(id);
    const stuck: ProjectStore = {
      ...store,
      discardDraft: () => Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk'))),
    };
    const other = studio({ store: stuck });
    await other.session.open(id);
    await other.session.dismissDraft();
    expect(other.session.draft.getState()).not.toBeNull();

    await next.session.create({ key: 'OTHER', name: 'Autre' });
    expect(next.session.draft.getState()).toBeNull();
    await next.session.open(id);
    expect(next.session.draft.getState()).not.toBeNull();
    await next.session.close();
    expect(next.session.draft.getState()).toBeNull();
  });

  it('tells those who listen, each time the offer changes', async () => {
    const { next, id } = await withDraft();
    let told = 0;
    next.session.draft.subscribe(() => (told += 1));
    await next.session.open(id);
    await next.session.recover();
    expect(told).toBe(2);
  });
});

/** A store whose saves fail, as a disk that is full or another tab that saved first would make them. */
function savesFailing(
  store: ProjectStore,
  code: 'STORAGE_UNAVAILABLE' | 'VERSION_CONFLICT',
  drafts = true,
): ProjectStore {
  return {
    ...store,
    save: () => Promise.resolve(err(domainError(code, 'no'))),
    saveDraft: (draft) =>
      drafts
        ? store.saveDraft(draft)
        : Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'no'))),
  };
}

describe('leaving a project whose changes could not be saved (never lose them in silence)', () => {
  it.each([
    ['the store fails', 'STORAGE_UNAVAILABLE'],
    ['another tab saved first', 'VERSION_CONFLICT'],
  ] as const)(
    'keeps the changes as a recovery draft when the project is closed and %s',
    async (_why, code) => {
      const first = await created();
      const flaky = studio({ store: savesFailing(first.store, code) });
      await flaky.session.open(first.id);
      flaky.bus.execute(projectUpdate({ name: 'Perdu ?' }));
      const closed = await flaky.session.close();
      expect(closed.ok).toBe(true);
      expect(flaky.session.current()).toBeNull();
      expect((await stored(first.store, first.id)).entry.name).toBe('Demo');
      const draft = await first.store.loadDraft(first.id);
      const kept = draft.ok && draft.value?.files['project.json'];
      expect((kept as { project: { name: string } }).project.name).toBe('Perdu ?');
    },
  );

  it('keeps the project open, and says why, when the changes can be neither saved nor kept', async () => {
    const first = await created();
    const broken = studio({ store: savesFailing(first.store, 'STORAGE_UNAVAILABLE', false) });
    await broken.session.open(first.id);
    broken.bus.execute(projectUpdate({ name: 'Perdu ?' }));
    const closed = await broken.session.close();
    expect(closed.ok ? '' : closed.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(broken.session.current()).toBe(first.id);
    expect(broken.name()).toBe('Perdu ?');
    expect(broken.session.status.getState().phase).toBe('error');
  });

  it('keeps the changes of the project that is left when another one is opened', async () => {
    const first = await created();
    const second = await first.session.create({ key: 'OTHER', name: 'Autre' });
    if (!second.ok) throw new Error(second.error.message);
    await first.session.close();
    const flaky = studio({ store: savesFailing(first.store, 'VERSION_CONFLICT') });
    await flaky.session.open(first.id);
    flaky.bus.execute(projectUpdate({ name: 'Perdu ?' }));
    const opened = await flaky.session.open(second.value.id);
    expect(opened.ok).toBe(true);
    expect(flaky.session.current()).toBe(second.value.id);
    const draft = await first.store.loadDraft(first.id);
    expect(draft.ok && draft.value).not.toBeNull();
  });

  it('does not open or create anything when the changes of the open project can be neither saved nor kept', async () => {
    const first = await created();
    const other = await first.session.create({ key: 'OTHER', name: 'Autre' });
    if (!other.ok) throw new Error(other.error.message);
    await first.session.close();
    const broken = studio({ store: savesFailing(first.store, 'STORAGE_UNAVAILABLE', false) });
    await broken.session.open(first.id);
    broken.bus.execute(projectUpdate({ name: 'Perdu ?' }));

    const opening = await broken.session.open(other.value.id);
    expect(opening.ok).toBe(false);
    const creating = await broken.session.create({ key: 'THIRD', name: 'Troisième' });
    expect(creating.ok).toBe(false);
    expect(broken.session.current()).toBe(first.id);
    expect(broken.name()).toBe('Perdu ?');
    const all = await first.store.list();
    expect(all.ok && all.value.map((entry) => entry.key).sort()).toEqual(['DEMO', 'OTHER']);
  });

  it('saves a change made while another project is being read, before that one replaces it', async () => {
    const first = await created();
    const other = await first.session.create({ key: 'OTHER', name: 'Autre' });
    if (!other.ok) throw new Error(other.error.message);
    await first.session.close();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: ProjectStore = {
      ...first.store,
      load: async (id) => {
        if (id === other.value.id) await gate;
        return first.store.load(id);
      },
    };
    const racing = studio({ store: slow });
    await racing.session.open(first.id);
    const opening = racing.session.open(other.value.id);
    // Past the first save of the open project: the change falls while the other one is being read.
    await new Promise((resolve) => setTimeout(resolve, 10));
    racing.bus.execute(projectUpdate({ name: 'Modifié pendant la lecture' }));
    release();
    await opening;
    expect(racing.session.current()).toBe(other.value.id);
    expect((await stored(first.store, first.id)).entry.name).toBe('Modifié pendant la lecture');
  });
  it('saves, and does not just keep as a draft, a change that comes while the last save is on its way', async () => {
    const first = await created();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let saves = 0;
    const slow: ProjectStore = {
      ...first.store,
      save: async (summary, files, expected, at) => {
        saves += 1;
        if (saves === 1) await gate;
        return first.store.save(summary, files, expected, at);
      },
    };
    const made = studio({ store: slow });
    await made.session.open(first.id);
    made.bus.execute(projectUpdate({ name: 'B' }));
    const closing = made.session.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The first save (of B) is on its way: a change comes now, and must not be reduced to a draft.
    made.bus.execute(projectUpdate({ name: 'C' }));
    release();
    expect((await closing).ok).toBe(true);
    expect((await stored(first.store, first.id)).entry.name).toBe('C');
    expect(await first.store.loadDraft(first.id)).toEqual({ ok: true, value: null });
  });

  it('saves a change made while a project is being created, before the new one replaces it', async () => {
    const first = await created();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: ProjectStore = {
      ...first.store,
      create: async (summary, files, at) => {
        await gate;
        return first.store.create(summary, files, at);
      },
    };
    const racing = studio({ store: slow });
    await racing.session.open(first.id);
    const creating = racing.session.create({ key: 'NEWK', name: 'Nouveau' });
    // Past the first save of the open project: the change falls while the other one is being read.
    await new Promise((resolve) => setTimeout(resolve, 10));
    racing.bus.execute(projectUpdate({ name: 'Modifié pendant la création' }));
    release();
    const made = await creating;
    expect(made.ok).toBe(true);
    expect((await stored(first.store, first.id)).entry.name).toBe('Modifié pendant la création');
  });
});

describe('a save that throws', () => {
  it('does not stop the saves that follow: the status says so, and the next request saves', async () => {
    const first = await created();
    let throwing = true;
    const exploding: ProjectStore = {
      ...first.store,
      save: (summary, files, expected, at) => {
        if (throwing) throw new Error('boom');
        return first.store.save(summary, files, expected, at);
      },
    };
    const made = studio({ store: exploding });
    await made.session.open(first.id);
    made.bus.execute(projectUpdate({ name: 'Un' }));
    await expect(made.session.flush()).resolves.toBeUndefined();
    expect(made.session.status.getState().phase).toBe('error');

    throwing = false;
    await made.session.flush();
    expect((await stored(first.store, first.id)).entry.name).toBe('Un');
    expect(made.session.status.getState()).toEqual({ phase: 'saved' });
  });
});

describe('a change made while a recovery draft is on offer', () => {
  it('withdraws the offer at once, and the draft is replaced by the next save, not lost before', async () => {
    const { store, next, id } = await withDraft();
    await next.session.open(id);
    expect(next.session.draft.getState()).not.toBeNull();

    next.bus.execute(projectUpdate({ name: 'Autre travail' }));
    // The offer is gone from the screen, and the draft is still in the store: closing the tab now
    // would leave it to be offered again.
    expect(next.session.draft.getState()).toBeNull();
    expect(await store.loadDraft(id)).not.toEqual({ ok: true, value: null });

    await next.session.flush();
    expect(await store.loadDraft(id)).toEqual({ ok: true, value: null });
    expect((await stored(store, id)).entry.name).toBe('Autre travail');
    expect((await next.session.recover()).ok).toBe(false);
  });

  it('is replaced by the new work when that work does not validate either', async () => {
    const { store, next, state, id } = await withDraft();
    await next.session.open(id);
    next.bus.execute(pageRename({ pageId: next.state().initialPageId, key: 'Autre mauvaise clé' }));
    expect(next.session.draft.getState()).toBeNull();
    await next.session.flush();
    const draft = await store.loadDraft(id);
    const page = draft.ok && draft.value ? JSON.stringify(draft.value.files) : '';
    expect(page).toContain('Autre mauvaise clé');
    expect(page).not.toContain('Not A Key');
    expect(state()).toBeDefined();
  });
});

describe('200 modifications, undo all, redo all, reload (critère de sortie du lot 5)', () => {
  it('gives the same project after a reload as before', async () => {
    const { store, session, bus, state, id } = await created();
    const ids: Id<'page'>[] = [];
    for (let i = 0; i < 200; i += 1) {
      if (i % 4 === 0 || ids.length < 3) {
        const command = pageAdd({ key: `page${i}`, route: `/page${i}`, title: `Page ${i}` });
        bus.execute(command);
        ids.push(command.payload.pageId);
      } else if (i % 4 === 1) {
        bus.execute(pageRename({ pageId: ids[i % ids.length] as Id<'page'>, key: `renamed${i}` }));
      } else if (i % 4 === 2) {
        bus.execute(
          pageMove({
            pageId: ids[i % ids.length] as Id<'page'>,
            toIndex: i % state().pages.order.length,
          }),
        );
      } else {
        bus.execute(
          pageRename({ pageId: ids[(i * 7) % ids.length] as Id<'page'>, route: `/moved${i}` }),
        );
      }
    }
    expect(bus.history.getState().undo).toHaveLength(200);
    const final = structuredClone(toFiles(state()));

    while (bus.undo());
    expect(state().pages.order).toHaveLength(1);
    while (bus.redo());
    expect(toFiles(state())).toEqual(final);
    await session.flush();

    const reloaded = studio({ store });
    const opened = await reloaded.session.open(id);
    expect(opened.ok).toBe(true);
    expect(reloaded.state()).toEqual(state());
    expect(toFiles(reloaded.state())).toEqual(final);
  });
});
