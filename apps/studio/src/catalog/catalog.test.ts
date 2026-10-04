import { UUID_V7_PATTERN, newId } from '@acs/domain';
import type { CatalogEntry, PackageFiles } from '@acs/domain';
import { PROJECT_KEY_PATTERN, validateFiles } from '@acs/project-schema';
import { VALID_FIXTURES } from '@acs/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import fr from '../locales/fr.json';
import { createProject } from '../project/create-project.js';
import { fromFiles, toFiles } from '../project/project-state.js';
import { copyName, duplicateFiles, freeKey } from './duplicate.js';
import { queryCatalog } from './query.js';

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: newId(),
  key: 'DEMO',
  name: 'Demo',
  description: '',
  author: 'Ada',
  version: '0.1.0',
  locale: 'fr-FR',
  status: 'active',
  revision: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const keysOf = (entries: readonly CatalogEntry[]) => entries.map((item) => item.key);

describe('searching, filtering and sorting the catalogue (EF-PRJ-02)', () => {
  const crm = entry({
    key: 'CRM',
    name: 'Gestion clients',
    author: 'Zoé',
    description: 'Suivi des ventes',
  });
  const stock = entry({ key: 'STOCK', name: 'Équipe stock', author: 'Ada', status: 'archived' });
  const old = entry({ key: 'OLD', name: 'Ancien outil', author: 'Ada', status: 'trashed' });
  const all = [crm, stock, old];

  it('shows the active projects, and the archived ones or the trash when asked', () => {
    expect(keysOf(queryCatalog(all))).toEqual(['CRM']);
    expect(keysOf(queryCatalog(all, { status: 'active' }))).toEqual(['CRM']);
    expect(keysOf(queryCatalog(all, { status: 'archived' }))).toEqual(['STOCK']);
    expect(keysOf(queryCatalog(all, { status: 'trashed' }))).toEqual(['OLD']);
    expect(
      keysOf(queryCatalog(all, { status: 'all', sort: { field: 'key', dir: 'asc' } })),
    ).toEqual(['CRM', 'OLD', 'STOCK']);
  });

  it('finds words in the name, the key, the description and the author, without caring for case or accents', () => {
    const find = (search: string) =>
      keysOf(queryCatalog(all, { status: 'all', search, sort: { field: 'key', dir: 'asc' } }));
    expect(find('clients')).toEqual(['CRM']);
    expect(find('CRM')).toEqual(['CRM']);
    expect(find('ventes')).toEqual(['CRM']);
    expect(find('zoe')).toEqual(['CRM']);
    expect(find('equipe')).toEqual(['STOCK']);
    expect(find('ÉQUIPE')).toEqual(['STOCK']);
    expect(find('ada')).toEqual(['OLD', 'STOCK']);
  });

  it('needs every word, and shows everything for a search that holds none', () => {
    const find = (search: string) => keysOf(queryCatalog(all, { status: 'all', search }));
    expect(find('gestion ventes')).toEqual(['CRM']);
    expect(find('gestion stock')).toEqual([]);
    expect(find('introuvable')).toEqual([]);
    expect(find('')).toHaveLength(3);
    expect(find('   ')).toHaveLength(3);
  });

  it('sorts by the most recently changed first, and by each field in both ways', () => {
    const a = entry({
      key: 'A',
      name: 'zèbre',
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    const b = entry({
      key: 'B',
      name: 'Abeille',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    });
    const c = entry({
      key: 'C',
      name: 'école',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
    const sorted = (field: 'name' | 'key' | 'updatedAt' | 'createdAt', dir: 'asc' | 'desc') =>
      keysOf(queryCatalog([a, b, c], { sort: { field, dir } }));
    expect(keysOf(queryCatalog([a, b, c]))).toEqual(['B', 'C', 'A']);
    expect(sorted('updatedAt', 'asc')).toEqual(['A', 'C', 'B']);
    expect(sorted('createdAt', 'asc')).toEqual(['B', 'C', 'A']);
    expect(sorted('createdAt', 'desc')).toEqual(['A', 'C', 'B']);
    expect(sorted('key', 'desc')).toEqual(['C', 'B', 'A']);
    // An accent does not put a name at the end: « école » comes after « Abeille », before « zèbre ».
    expect(sorted('name', 'asc')).toEqual(['B', 'C', 'A']);
    expect(sorted('name', 'desc')).toEqual(['A', 'C', 'B']);
  });

  it('does not tell « Ecole » from « École » when it sorts, as the search does not: the identifier decides', () => {
    const accented = entry({ key: 'WITH', name: 'École' });
    const plain = entry({ key: 'PLAIN', name: 'Ecole' });
    expect(accented.id < plain.id).toBe(true);
    expect(
      keysOf(queryCatalog([plain, accented], { sort: { field: 'name', dir: 'asc' } })),
    ).toEqual(['WITH', 'PLAIN']);
  });

  it('puts « Projet 2 » before « Projet 10 »', () => {
    const ten = entry({ key: 'TEN', name: 'Projet 10' });
    const two = entry({ key: 'TWO', name: 'Projet 2' });
    expect(keysOf(queryCatalog([ten, two], { sort: { field: 'name', dir: 'asc' } }))).toEqual([
      'TWO',
      'TEN',
    ]);
  });

  it('does not change what it is given', () => {
    const given = [entry({ key: 'B' }), entry({ key: 'A' })];
    const snapshot = structuredClone(given);
    queryCatalog(given, { sort: { field: 'key', dir: 'asc' } });
    expect(given).toEqual(snapshot);
  });

  it('property: it gives the same list whatever the order the entries come in, and only matching ones', () => {
    const arbitrary = fc.record({
      key: fc.constantFrom('AA', 'BB', 'CC', 'DD'),
      name: fc.constantFrom('Alpha', 'alpha', 'Équipe', 'zèbre', 'Projet 2', 'Projet 10'),
      status: fc.constantFrom('active', 'archived', 'trashed'),
      updatedAt: fc.constantFrom('2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
    });
    fc.assert(
      fc.property(
        fc.array(arbitrary, { maxLength: 12 }),
        fc.constantFrom('name', 'key', 'updatedAt'),
        fc.constantFrom('asc', 'desc'),
        fc.constantFrom('', 'alpha', 'equipe', 'projet'),
        fc.constantFrom('active', 'all', 'trashed'),
        (rows, field, dir, search, status) => {
          const entries = rows.map((row) => entry(row));
          const query = { search, status, sort: { field, dir } } as const;
          const forward = queryCatalog(entries, query).map((item) => item.id);
          const backward = queryCatalog([...entries].reverse(), query).map((item) => item.id);
          expect(backward).toEqual(forward);
          for (const kept of queryCatalog(entries, query)) {
            expect(status === 'all' || kept.status === status).toBe(true);
          }
        },
      ),
    );
  });
});

const ANY_ID = new RegExp(UUID_V7_PATTERN.slice(1, -1), 'g');
const identifiersOf = (files: PackageFiles): string[] => JSON.stringify(files).match(ANY_ID) ?? [];

/** The package with each identifier replaced by the order it first appears in: its shape. */
function shapeOf(files: PackageFiles): string {
  const seen = new Map<string, number>();
  return JSON.stringify(files).replace(ANY_ID, (id) => {
    if (!seen.has(id)) seen.set(id, seen.size);
    return `#${seen.get(id)}`;
  });
}

const sources: [string, PackageFiles][] = [
  ...Object.entries(VALID_FIXTURES).map(([name, fixture]): [string, PackageFiles] => [
    name,
    fixture() as PackageFiles,
  ]),
  [
    'a project created in the Studio',
    (() => {
      const made = createProject({ key: 'DEMO', name: 'Demo' });
      if (!made.ok) throw new Error(made.error.message);
      return toFiles(made.value);
    })(),
  ],
];

describe('duplicating a project (EF-PRJ-02)', () => {
  it.each(sources)(
    'gives a copy of %s that shares no identifier with it, and is still a project',
    (_name, files) => {
      const original = structuredClone(files);
      const copy = duplicateFiles(files, { key: 'COPY', name: 'Copie' });
      expect(files).toEqual(original);

      const before = new Set(identifiersOf(files));
      const after = identifiersOf(copy);
      expect(before.size).toBeGreaterThan(0);
      expect(after.filter((id) => before.has(id))).toEqual([]);
      expect(new Set(after).size).toBe(before.size);
      expect(validateFiles(copy).ok).toBe(true);
      expect(fromFiles(copy).ok).toBe(true);
    },
  );

  it.each(sources)('keeps every reference of %s pointing at the same object', (_name, files) => {
    const manifest = files['project.json'] as { project: { key: string; name: string } };
    const copy = duplicateFiles(files, manifest.project);
    // Same package, up to the names of the identifiers: nothing was added, lost or crossed.
    expect(shapeOf(copy)).toBe(shapeOf(files));
    expect(Object.keys(copy).map((path) => path.replace(ANY_ID, '#'))).toEqual(
      Object.keys(files).map((path) => path.replace(ANY_ID, '#')),
    );
  });

  it('changes the key and the name, and only those, of the project', () => {
    const files = sources[0]?.[1] as PackageFiles;
    const copy = duplicateFiles(files, { key: 'COPY', name: 'Copie' });
    const project = (copy['project.json'] as { project: Record<string, unknown> }).project;
    const first = (files['project.json'] as { project: Record<string, unknown> }).project;
    expect(project['key']).toBe('COPY');
    expect(project['name']).toBe('Copie');
    for (const field of ['description', 'author', 'version', 'locale', 'storageMode']) {
      expect(project[field]).toBe(first[field]);
    }
  });

  it('gives the same new identifier to every place the old one was written', () => {
    let count = 0;
    const generate = () => `01920000-0000-7000-8000-${String(count++).padStart(12, '0')}`;
    const files = { 'project.json': { project: { key: 'A', name: 'a', id: 'x' } } };
    const id = newId();
    const given = {
      ...files,
      [`pages/${id}.json`]: { id, nodes: { [id]: { id } } },
    } as unknown as PackageFiles;
    const copy = duplicateFiles(given, { key: 'COPY', name: 'Copie' }, generate);
    expect(Object.keys(copy).sort()).toEqual([
      'pages/01920000-0000-7000-8000-000000000000.json',
      'project.json',
    ]);
    expect(copy['pages/01920000-0000-7000-8000-000000000000.json']).toEqual({
      id: '01920000-0000-7000-8000-000000000000',
      nodes: {
        '01920000-0000-7000-8000-000000000000': { id: '01920000-0000-7000-8000-000000000000' },
      },
    });
    expect(count).toBe(1);
  });
});

describe('the key and the name of a copy', () => {
  it('takes the first number nobody has, trash included', () => {
    expect(freeKey('DEMO', new Set(['DEMO']))).toBe('DEMO2');
    expect(freeKey('DEMO', new Set(['DEMO', 'DEMO2', 'DEMO3']))).toBe('DEMO4');
    expect(freeKey('DEMO', new Set(['DEMO', 'DEMO3']))).toBe('DEMO2');
  });

  it('cuts a key of 16 characters to leave room for the number, and stays a valid key', () => {
    const long = 'ABCDEFGHIJKLMNOP';
    expect(freeKey(long, new Set([long]))).toBe('ABCDEFGHIJKLMNO2');
    // With 2 to 9 taken the number has two digits, and the key is cut one character more.
    const taken = new Set([long]);
    for (let n = 2; n <= 9; n += 1) taken.add(`ABCDEFGHIJKLMNO${n}`);
    const next = freeKey(long, taken);
    expect(next).toBe('ABCDEFGHIJKLMN10');
    expect(next).toMatch(new RegExp(PROJECT_KEY_PATTERN));
  });

  it('adds « (copie) » to the name, within the 200 characters of a label', () => {
    expect(copyName('Mon appli')).toBe(`Mon appli${fr['catalog.copySuffix']}`);
    expect(fr['catalog.copySuffix']).toBe(' (copie)');
    const long = copyName('x'.repeat(200));
    expect(long).toHaveLength(200);
    expect(long.endsWith(' (copie)')).toBe(true);
  });
});
