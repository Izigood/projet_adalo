import { createLocalProjectStore } from '@acs/data-repository';
import type { DomainError, Id, ProjectStore, Result } from '@acs/domain';
import { validateFiles } from '@acs/project-schema';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createCommandBus } from '../commands/bus.js';
import { projectUpdate } from '../commands/project-commands.js';
import { createProjectSession } from '../persistence/session.js';
import { createProjectStore } from '../project/project-store.js';
import { createCatalog } from './catalog.js';

const START = '2026-10-04T10:00:00.000Z';
const day = (n: number) => new Date(Date.parse(START) + n * 86_400_000).toISOString();

/** A studio whose clock the test sets, with a store of its own and no timer: saves are asked for. */
function studio() {
  const clock = { at: START };
  const store = createLocalProjectStore({ indexedDB: new IDBFactory(), IDBKeyRange });
  const project = createProjectStore();
  const bus = createCommandBus(project);
  const session = createProjectSession({
    store,
    bus,
    view: project.view,
    scheduler: { after: () => () => undefined },
    now: () => clock.at,
  });
  const catalog = createCatalog({
    store,
    now: () => clock.at,
    flush: session.flush,
    openId: session.current,
  });
  const create = async (key: string, name = `Projet ${key}`): Promise<Id> => {
    const made = await session.create({ key, name });
    if (!made.ok) throw new Error(made.error.message);
    return made.value.id;
  };
  return { clock, store, bus, session, catalog, create };
}

function value<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
const failure = <T>(result: Result<T, DomainError>): DomainError => {
  if (result.ok) throw new Error('the operation was accepted');
  return result.error;
};

const keys = (entries: readonly { key: string }[]) => entries.map((entry) => entry.key).sort();

describe('opening the catalogue (EF-PRJ-02)', () => {
  it('lists the active projects, and applies the search and the sort that are asked', async () => {
    const { catalog, session, create } = studio();
    await create('AA', 'Gestion clients');
    await create('BB', 'Équipe stock');
    await create('CC', 'Suivi clients');
    await session.close();
    const view = value(
      await catalog.open({ search: 'clients', sort: { field: 'key', dir: 'desc' } }),
    );
    expect(view.entries.map((entry) => entry.key)).toEqual(['CC', 'AA']);
    expect(view.purged).toEqual([]);
    expect(keys(value(await catalog.list()))).toEqual(['AA', 'BB', 'CC']);
  });

  it('lets go of what has been in the trash for 30 days when it opens, and reports it', async () => {
    const { catalog, clock, create, session } = studio();
    const old = await create('OLD');
    const young = await create('YOUNG');
    await create('KEPT');
    await session.close();
    value(await catalog.trash(old));
    clock.at = day(10);
    value(await catalog.trash(young));

    clock.at = day(30);
    const view = value(await catalog.open({ status: 'trashed' }));
    expect(view.purged).toEqual([old]);
    expect(keys(view.entries)).toEqual(['YOUNG']);
    expect(keys(value(await catalog.list({ status: 'all' })))).toEqual(['KEPT', 'YOUNG']);
  });

  it('does not purge when it only lists', async () => {
    const { catalog, clock, create, session } = studio();
    const old = await create('OLD');
    await session.close();
    value(await catalog.trash(old));
    clock.at = day(60);
    expect(keys(value(await catalog.list({ status: 'trashed' })))).toEqual(['OLD']);
  });

  it('gives a key back to those who want it once its project is purged', async () => {
    const { catalog, clock, create, session } = studio();
    const old = await create('DEMO');
    await session.close();
    value(await catalog.trash(old));
    expect((await session.create({ key: 'DEMO', name: 'Autre' })).ok).toBe(false);
    clock.at = day(30);
    value(await catalog.open());
    expect((await session.create({ key: 'DEMO', name: 'Autre' })).ok).toBe(true);
  });
});

describe('duplicating a project (EF-PRJ-02)', () => {
  it('stores a copy with identifiers of its own, a free key and « (copie) », and leaves the original', async () => {
    const { catalog, store, create, session } = studio();
    const id = await create('DEMO', 'Mon appli');
    await session.close();
    const before = value(await store.load(id));

    const copy = value(await catalog.duplicate(id));
    expect(copy).toMatchObject({
      key: 'DEMO2',
      name: 'Mon appli (copie)',
      status: 'active',
      revision: 1,
    });
    expect(copy.id).not.toBe(id);
    const stored = value(await store.load(copy.id));
    expect(validateFiles(stored?.files ?? {}).ok).toBe(true);
    const ids = (files: unknown) => JSON.stringify(files).match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? [];
    const original = new Set(ids(before?.files));
    expect(ids(stored?.files).filter((found) => original.has(found))).toEqual([]);
    expect(value(await store.load(id))).toEqual(before);
  });

  it('takes the identifiers of the copy from the generator it is given', async () => {
    const { store, session, create } = studio();
    const id = await create('DEMO');
    await session.close();
    let count = 0;
    const catalog = createCatalog({
      store,
      generate: () => `01920000-0000-7000-8000-${String(count++).padStart(12, '0')}`,
    });
    const copy = value(await catalog.duplicate(id));
    expect(copy.id).toMatch(/^01920000-0000-7000-8000-0000000000\d\d$/);
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('takes the next key each time, and goes past a key that is in the trash', async () => {
    const { catalog, create, session } = studio();
    const id = await create('DEMO');
    await session.close();
    const first = value(await catalog.duplicate(id));
    value(await catalog.trash(first.id));
    const second = value(await catalog.duplicate(id));
    const third = value(await catalog.duplicate(id));
    expect([first.key, second.key, third.key]).toEqual(['DEMO2', 'DEMO3', 'DEMO4']);
  });

  it('copies what was saved a moment ago in the open project, not what the store had', async () => {
    const { catalog, bus, create } = studio();
    const id = await create('DEMO', 'Avant');
    bus.execute(projectUpdate({ name: 'Après' }));
    const copy = value(await catalog.duplicate(id));
    expect(copy.name).toBe('Après (copie)');
  });

  it('can copy a project that is in the trash, and says no to one that does not exist', async () => {
    const { catalog, create, session } = studio();
    const id = await create('DEMO');
    await session.close();
    value(await catalog.trash(id));
    expect(value(await catalog.duplicate(id)).status).toBe('active');
    const ghost = await catalog.duplicate('01920000-0000-7000-8000-00000000dead' as Id);
    expect(failure(ghost).details).toEqual({ field: 'id' });
  });
});

describe('archiving, trashing and restoring (EF-PRJ-02)', () => {
  it('moves a project from one state to another, and the filters follow', async () => {
    const { catalog, clock, create, session } = studio();
    const id = await create('DEMO');
    await session.close();
    const listed = async (status: 'active' | 'archived' | 'trashed') =>
      keys(value(await catalog.list({ status })));

    clock.at = day(1);
    expect(value(await catalog.archive(id)).status).toBe('archived');
    expect([await listed('active'), await listed('archived')]).toEqual([[], ['DEMO']]);

    clock.at = day(2);
    const trashed = value(await catalog.trash(id));
    expect(trashed).toMatchObject({ status: 'trashed', trashedAt: day(2) });
    expect([await listed('archived'), await listed('trashed')]).toEqual([[], ['DEMO']]);

    const restored = value(await catalog.restore(id));
    expect(restored.status).toBe('active');
    expect('trashedAt' in restored).toBe(false);
    expect(await listed('active')).toEqual(['DEMO']);
  });

  it('takes a project out of the archive as well', async () => {
    const { catalog, create, session } = studio();
    const id = await create('DEMO');
    await session.close();
    value(await catalog.archive(id));
    expect(value(await catalog.restore(id)).status).toBe('active');
  });

  it('refuses to put the open project in the trash, which would end its saves, and archives it freely', async () => {
    const { catalog, bus, session, create } = studio();
    const id = await create('DEMO');
    const refused = failure(await catalog.trash(id));
    expect(refused.code).toBe('CONSTRAINT_VIOLATION');
    expect(refused.details).toEqual({ field: 'id' });
    expect(keys(value(await catalog.list()))).toEqual(['DEMO']);

    expect(value(await catalog.archive(id)).status).toBe('archived');
    bus.execute(projectUpdate({ name: 'Encore' }));
    await session.flush();
    expect(session.status.getState()).toEqual({ phase: 'saved' });

    await session.close();
    expect(value(await catalog.trash(id)).status).toBe('trashed');
  });

  it('says no to a project that does not exist', async () => {
    const { catalog } = studio();
    const ghost = '01920000-0000-7000-8000-00000000dead' as Id;
    for (const operation of [catalog.archive, catalog.trash, catalog.restore]) {
      expect(failure(await operation(ghost)).details).toEqual({ field: 'id' });
    }
  });
});

describe('without storage', () => {
  it('says STORAGE_UNAVAILABLE to everything', async () => {
    const store: ProjectStore = createLocalProjectStore({});
    const catalog = createCatalog({ store });
    const id = '01920000-0000-7000-8000-00000000dead' as Id;
    const results = [
      await catalog.open(),
      await catalog.list(),
      await catalog.duplicate(id),
      await catalog.archive(id),
      await catalog.trash(id),
      await catalog.restore(id),
    ];
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual(
      Array(6).fill('STORAGE_UNAVAILABLE'),
    );
  });
});
