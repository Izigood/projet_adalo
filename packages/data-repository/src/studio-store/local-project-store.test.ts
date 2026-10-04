import { newId } from '@acs/domain';
import type {
  CatalogEntry,
  CatalogSummary,
  DomainError,
  Id,
  PackageFiles,
  ProjectStore,
  Result,
} from '@acs/domain';
import type Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { dexieFor } from '../storage/database.js';
import type { IndexedDbSource } from '../storage/database.js';
import { STUDIO_DATABASE, createLocalProjectStore } from './local-project-store.js';

const AT = '2026-10-04T10:00:00.000Z';

/** The data base of the Studio as it is on disk, read without going through the store. */
async function rawDatabase(source: IndexedDbSource): Promise<Dexie> {
  const db = dexieFor(STUDIO_DATABASE, source);
  if (db === undefined) throw new Error('no IndexedDB');
  await db.open();
  return db;
}

/** A browser of its own for each test: nothing leaks from one to the next. */
const browser = (): IndexedDbSource => ({ indexedDB: new IDBFactory(), IDBKeyRange });

const summary = (key: string, over: Partial<CatalogSummary> = {}): CatalogSummary => ({
  id: newId(),
  key,
  name: `Projet ${key}`,
  description: '',
  author: 'Ada',
  version: '0.1.0',
  locale: 'fr-FR',
  ...over,
});

const files = (marker: string): PackageFiles => ({
  'project.json': { marker, nested: { list: [1, 2, 3] } },
});

function value<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
function failure<T>(result: Result<T, DomainError>): DomainError {
  if (result.ok) throw new Error('the operation was accepted');
  return result.error;
}

async function created(store: ProjectStore, key: string, over: Partial<CatalogSummary> = {}) {
  const made = summary(key, over);
  const entry = value(await store.create(made, files(key), AT));
  return { made, entry };
}

const days = (from: string, count: number, extraMs = 0): string =>
  new Date(Date.parse(from) + count * 86_400_000 + extraMs).toISOString();

describe('creating and reading projects (EF-PRJ-01)', () => {
  it('stores a project at revision 1, with its package, and gives them back', async () => {
    const store = createLocalProjectStore(browser());
    const { made, entry } = await created(store, 'DEMO');
    expect(entry).toEqual({
      ...made,
      status: 'active',
      revision: 1,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(value(await store.load(made.id))).toEqual({ entry, files: files('DEMO') });
  });

  it('is there after a reload: another store on the same browser reads it', async () => {
    const source = browser();
    const { made, entry } = await created(createLocalProjectStore(source), 'DEMO');
    const reloaded = createLocalProjectStore(source);
    expect(value(await reloaded.load(made.id))).toEqual({ entry, files: files('DEMO') });
    expect(value(await reloaded.list())).toEqual([entry]);
  });

  it('has nothing for a project it does not know', async () => {
    const store = createLocalProjectStore(browser());
    expect(value(await store.load(newId()))).toBeNull();
    expect(value(await store.list())).toEqual([]);
  });

  it('lists the projects in the order they were created, without their packages', async () => {
    const store = createLocalProjectStore(browser());
    const first = await created(store, 'AA');
    const second = await created(store, 'BB');
    const third = await created(store, 'CC');
    const listed = value(await store.list());
    expect(listed.map((entry) => entry.id)).toEqual([first, second, third].map((x) => x.made.id));
    expect(listed.every((entry) => !('files' in entry))).toBe(true);
  });

  it('refuses an identifier or a key that is already used, trashed projects included', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    expect(failure(await store.create({ ...made, key: 'OTHER' }, files('x'), AT)).details).toEqual({
      field: 'id',
    });
    const sameKey = failure(await store.create(summary('DEMO'), files('x'), AT));
    expect(sameKey.code).toBe('CONSTRAINT_VIOLATION');
    expect(sameKey.details).toEqual({ field: 'key' });
    value(await store.setStatus(made.id, 'trashed', AT));
    expect(failure(await store.create(summary('DEMO'), files('x'), AT)).details).toEqual({
      field: 'key',
    });
    expect(value(await store.list())).toHaveLength(1);
  });

  it('has a key index that is unique in the data base itself, whatever the store checks', async () => {
    const source = browser();
    const store = createLocalProjectStore(source);
    const { entry } = await created(store, 'DEMO');
    const raw = await rawDatabase(source);
    await expect(raw.table('projects').add({ ...entry, id: newId() })).rejects.toMatchObject({
      name: 'ConstraintError',
    });
    raw.close();
  });

  it('keeps only the fields of the catalogue, and takes a package that is frozen', async () => {
    const store = createLocalProjectStore(browser());
    const made = { ...summary('DEMO'), defaultThemeId: 'x' } as CatalogSummary;
    const frozen = Object.freeze({
      'project.json': Object.freeze({ marker: 'frozen' }),
    }) as PackageFiles;
    const entry = value(await store.create(made, frozen, AT));
    expect(Object.keys(entry).sort()).toEqual(
      [
        'author',
        'createdAt',
        'description',
        'id',
        'key',
        'locale',
        'name',
        'revision',
        'status',
        'updatedAt',
        'version',
      ].sort(),
    );
    expect(value(await store.load(made.id))?.files).toEqual({
      'project.json': { marker: 'frozen' },
    });
  });
});

describe('saving a project (revision lock)', () => {
  it('replaces the package and the summary, and counts the save', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    const later = days(AT, 1);
    const entry = value(
      await store.save({ ...made, name: 'Renamed', version: '0.2.0' }, files('v2'), 1, later),
    );
    expect(entry).toMatchObject({
      name: 'Renamed',
      version: '0.2.0',
      status: 'active',
      revision: 2,
      createdAt: AT,
      updatedAt: later,
    });
    expect(value(await store.load(made.id))).toEqual({ entry, files: files('v2') });
  });

  it('refuses a stale revision, says which one is there, and keeps what is there', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    value(await store.save(made, files('v2'), 1, AT));
    const stale = failure(await store.save(made, files('lost'), 1, AT));
    expect(stale.code).toBe('VERSION_CONFLICT');
    expect(stale.details).toEqual({ expected: 1, found: 2 });
    expect(value(await store.load(made.id))?.files).toEqual(files('v2'));
  });

  it('gives the revision to the first of two tabs that save, and tells the other', async () => {
    const source = browser();
    const tabA = createLocalProjectStore(source);
    const tabB = createLocalProjectStore(source);
    const { made } = await created(tabA, 'DEMO');
    const [a, b] = await Promise.all([
      tabA.save(made, files('A'), 1, AT),
      tabB.save(made, files('B'), 1, AT),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const loser = failure(a.ok ? b : a);
    expect(loser.code).toBe('VERSION_CONFLICT');
    const winner = a.ok ? 'A' : 'B';
    expect(value(await tabA.load(made.id))?.files).toEqual(files(winner));
  });

  it('refuses a project it does not know, a key another project has, and a trashed project', async () => {
    const store = createLocalProjectStore(browser());
    const one = await created(store, 'AA');
    const two = await created(store, 'BB');
    expect(failure(await store.save(summary('ZZ'), files('x'), 1, AT)).details).toEqual({
      field: 'id',
    });
    expect(
      failure(await store.save({ ...one.made, key: 'BB' }, files('x'), 1, AT)).details,
    ).toEqual({ field: 'key' });
    value(await store.setStatus(two.made.id, 'trashed', AT));
    expect(failure(await store.save(two.made, files('x'), 1, AT)).details).toEqual({
      field: 'status',
    });
    expect(value(await store.load(one.made.id))?.entry.revision).toBe(1);
  });

  it('lets a project change its own key, and keeps its status', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    value(await store.setStatus(made.id, 'archived', AT));
    const entry = value(await store.save({ ...made, key: 'NEWKEY' }, files('x'), 1, AT));
    expect(entry).toMatchObject({ key: 'NEWKEY', status: 'archived', revision: 2 });
  });
});

describe('archive, trash and restore (EF-PRJ-02)', () => {
  it('archives, trashes with the date, and restores, keeping the package and the revision', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    const later = days(AT, 2);

    const archived = value(await store.setStatus(made.id, 'archived', later));
    expect(archived).toMatchObject({ status: 'archived', revision: 1, updatedAt: AT });
    expect('trashedAt' in archived).toBe(false);

    const trashed = value(await store.setStatus(made.id, 'trashed', later));
    expect(trashed).toMatchObject({ status: 'trashed', trashedAt: later, updatedAt: AT });

    const restored = value(await store.setStatus(made.id, 'active', days(AT, 3)));
    expect(restored.status).toBe('active');
    expect('trashedAt' in restored).toBe(false);
    expect(value(await store.load(made.id))?.files).toEqual(files('DEMO'));
  });

  it('does not move the date of the trash when asked to trash what is already there', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    value(await store.setStatus(made.id, 'trashed', AT));
    const again = value(await store.setStatus(made.id, 'trashed', days(AT, 10)));
    expect(again.trashedAt).toBe(AT);
  });

  it('refuses a project it does not know', async () => {
    const store = createLocalProjectStore(browser());
    expect(failure(await store.setStatus(newId(), 'trashed', AT)).details).toEqual({ field: 'id' });
  });
});

describe('purging the trash (EF-PRJ-02: 30 days)', () => {
  it('purges what has been in the trash for 30 days, with its package and its draft, and nothing else', async () => {
    const source = browser();
    const store = createLocalProjectStore(source);
    const old = await created(store, 'OLD');
    const young = await created(store, 'YOUNG');
    const active = await created(store, 'ACTIVE');
    const archived = await created(store, 'ARCHIVED');
    value(await store.setStatus(old.made.id, 'trashed', AT));
    value(await store.setStatus(young.made.id, 'trashed', days(AT, 5)));
    value(await store.setStatus(archived.made.id, 'archived', AT));
    value(
      await store.saveDraft({
        projectId: old.made.id,
        savedAt: AT,
        baseRevision: 1,
        files: files('draft'),
      }),
    );

    const purged = value(await store.purgeTrash(days(AT, 30)));
    expect(purged).toEqual([old.made.id]);
    expect(value(await store.load(old.made.id))).toBeNull();
    expect(value(await store.loadDraft(old.made.id))).toBeNull();
    // Nothing of it is left in the data base itself, not a package nobody can reach any more.
    const raw = await rawDatabase(source);
    expect(await raw.table('packages').toCollection().primaryKeys()).not.toContain(old.made.id);
    expect(await raw.table('drafts').toCollection().primaryKeys()).not.toContain(old.made.id);
    raw.close();
    const kept = value(await store.list()).map((entry) => entry.key);
    expect(kept.sort()).toEqual(['ACTIVE', 'ARCHIVED', 'YOUNG']);
    expect(value(await store.load(active.made.id))?.files).toEqual(files('ACTIVE'));
  });

  it('keeps a project 29 days and 23 hours, and a key that is free again once it is purged', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    value(await store.setStatus(made.id, 'trashed', AT));
    expect(value(await store.purgeTrash(days(AT, 30, -1)))).toEqual([]);
    expect(value(await store.purgeTrash(days(AT, 30)))).toEqual([made.id]);
    expect(value(await store.create(summary('DEMO'), files('again'), AT)).revision).toBe(1);
  });
});

describe('the recovery draft (RG-13)', () => {
  const draftOf = (projectId: Id, marker: string) => ({
    projectId,
    savedAt: AT,
    baseRevision: 1,
    files: files(marker),
  });

  it('keeps one draft per project, replaces it, and gives it back after a reload', async () => {
    const source = browser();
    const store = createLocalProjectStore(source);
    const { made } = await created(store, 'DEMO');
    expect(value(await store.loadDraft(made.id))).toBeNull();
    value(await store.saveDraft(draftOf(made.id, 'first')));
    value(await store.saveDraft(draftOf(made.id, 'second')));
    expect(value(await createLocalProjectStore(source).loadDraft(made.id))).toEqual(
      draftOf(made.id, 'second'),
    );
  });

  it('is discarded on request, and discarding nothing is not an error', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    value(await store.saveDraft(draftOf(made.id, 'draft')));
    value(await store.discardDraft(made.id));
    expect(value(await store.loadDraft(made.id))).toBeNull();
    value(await store.discardDraft(made.id));
  });

  it('is not the project: the saved package is untouched by a draft', async () => {
    const store = createLocalProjectStore(browser());
    const { made } = await created(store, 'DEMO');
    value(await store.saveDraft(draftOf(made.id, 'draft')));
    expect(value(await store.load(made.id))?.files).toEqual(files('DEMO'));
  });

  it('refuses a draft for a project that does not exist', async () => {
    const store = createLocalProjectStore(browser());
    expect(failure(await store.saveDraft(draftOf(newId(), 'x'))).details).toEqual({ field: 'id' });
  });
});

describe('without IndexedDB', () => {
  it('says STORAGE_UNAVAILABLE to every operation, and tries again when asked again', async () => {
    const store = createLocalProjectStore({});
    const id = newId();
    const results: Result<unknown, DomainError>[] = [
      await store.list(),
      await store.load(id),
      await store.create(summary('DEMO'), files('x'), AT),
      await store.save(summary('DEMO'), files('x'), 1, AT),
      await store.setStatus(id, 'trashed', AT),
      await store.purgeTrash(AT),
      await store.saveDraft({ projectId: id, savedAt: AT, baseRevision: 1, files: files('x') }),
      await store.loadDraft(id),
      await store.discardDraft(id),
    ];
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual(
      Array(9).fill('STORAGE_UNAVAILABLE'),
    );
  });
});

describe('a browser whose storage comes late', () => {
  it('fails while there is none, and works as soon as there is one: the failure is not kept', async () => {
    const source: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = {};
    const store = createLocalProjectStore(source);
    expect(failure(await store.list()).code).toBe('STORAGE_UNAVAILABLE');
    source.indexedDB = new IDBFactory();
    source.IDBKeyRange = IDBKeyRange;
    expect(value(await store.list())).toEqual([]);
    await created(store, 'DEMO');
    expect(value(await store.list())).toHaveLength(1);
  });
});

describe('what comes back is a copy', () => {
  it('does not change the store when the caller changes what it was given or got', async () => {
    const store = createLocalProjectStore(browser());
    const given = { 'project.json': { marker: 'DEMO', nested: { list: [1, 2, 3] } } };
    const made = summary('DEMO');
    value(await store.create(made, given as PackageFiles, AT));
    given['project.json'].nested.list.push(4);
    const got = value(await store.load(made.id));
    (got?.files['project.json'] as { nested: { list: number[] } }).nested.list.push(5);
    expect(value(await store.load(made.id))?.files).toEqual(files('DEMO'));
    const entries: readonly CatalogEntry[] = value(await store.list());
    expect(entries).toHaveLength(1);
  });
});
