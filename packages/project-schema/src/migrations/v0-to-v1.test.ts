import { isUuidV7, newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { migratePackage, openPackage } from '../index.js';
import type { MigrationContext, PackageFiles } from '../index.js';

type Json = Record<string, unknown>;

const v0 = (extra: Json = {}): Json => ({
  project: { code: 'CRM', title: 'Clients', lang: 'fr-FR', version: '0.3.0' },
  entities: [
    {
      id: 'e1',
      name: 'customer',
      title: 'Client',
      fields: [
        { id: 'f1', name: 'name', title: 'Nom', type: 'string', required: true },
        { id: 'f2', name: 'balance', title: 'Solde', type: 'number', decimals: 2 },
      ],
    },
    {
      id: 'e2',
      name: 'order',
      title: 'Commande',
      fields: [{ id: 'f3', name: 'customer', title: 'Client', type: 'link', to: 'e1' }],
    },
  ],
  relations: [{ id: 'r1', from: 'e1', to: 'e2', kind: 'one-to-many' }],
  screens: [
    { id: 's1', name: 'home', path: '/', tree: { component: 'title', props: { text: 'Bonjour' } } },
  ],
  theme: { name: 'Clair', colors: { 'color.surface': '#ffffff' } },
  ...extra,
});

/** Migrates a v0 document, recording the hint of every identifier requested. */
function migrate(doc: Json, extraFiles: Json = {}) {
  const hints: string[] = [];
  const context: MigrationContext = {
    newId: (hint) => {
      hints.push(hint);
      return newId();
    },
  };
  const result = migratePackage({ 'project.json': doc, ...extraFiles }, { context });
  return { hints, result };
}

function migrated(doc: Json = v0(), extraFiles: Json = {}): Record<string, Json> {
  const { result } = migrate(doc, extraFiles);
  expect(result.ok, JSON.stringify(result.ok ? null : result.error.details)).toBe(true);
  return (result.ok ? result.value : {}) as Record<string, Json>;
}

function issuesOf(doc: Json): string[] {
  const { result } = migrate(doc);
  expect(result.ok).toBe(false);
  if (result.ok) return [];
  expect(result.error.code).toBe('MANIFEST_INVALID');
  const issues = (
    result.error.details as { issues: { file: string; keyword: string; path: string }[] }
  ).issues;
  expect(issues.every((issue) => issue.file === 'project.json')).toBe(true);
  return issues.map((issue) => `${issue.keyword} ${issue.path}`);
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const entitiesOf = (files: Record<string, Json>) =>
  files['schema/entities.json'] as { entities: Json[]; relations: Json[] };

describe('migration v0 to v1: project', () => {
  it('renames code, title and lang, and applies the v1 defaults', () => {
    const files = migrated();
    const manifest = files['project.json'] as {
      manifestVersion: number;
      project: Json;
      runtime: Json;
    };
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.project).toMatchObject({
      key: 'CRM',
      name: 'Clients',
      locale: 'fr-FR',
      version: '0.3.0',
      description: '',
      author: '',
      storageMode: 'local',
    });
    expect(manifest.runtime).toEqual({ minVersion: '1.0.0' });
  });

  it('keeps the author and description when v0 had them', () => {
    const doc = v0({
      project: {
        code: 'CRM',
        title: 'T',
        lang: 'fr',
        version: '1.0.0',
        author: 'ada',
        description: 'd',
      },
    });
    const manifest = migrated(doc)['project.json'] as { project: Json };
    expect(manifest.project).toMatchObject({ author: 'ada', description: 'd' });
  });

  it('replaces every free-text identifier by a UUID v7, asking for each by a meaningful hint', () => {
    const { hints, result } = migrate(v0());
    expect(result.ok).toBe(true);
    expect(hints).toEqual(
      expect.arrayContaining([
        'entity:e1',
        'entity:e2',
        'field:e1.f1',
        'field:e1.f2',
        'field:e2.f3',
        'relation:r1',
        'page:s1',
        'node:s1/root',
        'theme',
        'project',
      ]),
    );
    const files = (result.ok ? result.value : {}) as Record<string, Json>;
    const project = (files['project.json'] as { project: { id: string; defaultThemeId: string } })
      .project;
    expect(isUuidV7(project.id)).toBe(true);
    expect(isUuidV7(project.defaultThemeId)).toBe(true);
  });
});

describe('migration v0 to v1: data model', () => {
  it('turns name and title into key and label, and sets kind and classification', () => {
    const [customer] = entitiesOf(migrated()).entities;
    expect(customer).toMatchObject({
      key: 'customer',
      label: 'Client',
      kind: 'business',
      classification: 'interne',
    });
  });

  it('maps the legacy field types', () => {
    const fields = (types: Json[]) =>
      (
        entitiesOf(
          migrated(
            v0({
              entities: [
                {
                  id: 'e1',
                  name: 'x',
                  title: 'X',
                  fields: types.map((t, i) => ({ id: `f${i}`, name: `f${i}`, title: 'F', ...t })),
                },
              ],
              relations: [],
            }),
          ),
        ).entities[0] as { fields: Json[] }
      ).fields;
    const [text, longtext, integer, decimal, boolean, date] = fields([
      { type: 'string' },
      { type: 'longtext' },
      { type: 'number' },
      { type: 'number', decimals: 3 },
      { type: 'bool' },
      { type: 'date' },
    ]);
    expect(text).toMatchObject({ type: 'string', required: false, classification: 'interne' });
    expect(longtext).toMatchObject({ type: 'text' });
    expect(integer).toMatchObject({ type: 'integer' });
    expect(decimal).toMatchObject({ type: 'decimal', options: { precision: 18, scale: 3 } });
    expect(boolean).toMatchObject({ type: 'boolean' });
    expect(date).toMatchObject({ type: 'date' });
  });

  it('keeps required, and points a link at the new id of its target entity', () => {
    const { entities } = entitiesOf(migrated());
    const [customer, order] = entities as { id: string; fields: Json[] }[];
    expect(customer?.fields[0]).toMatchObject({ required: true });
    expect(order?.fields[0]).toMatchObject({
      type: 'reference',
      options: { target: customer?.id },
    });
  });

  it('follows a link to an entity declared later', () => {
    const doc = v0({
      entities: [
        {
          id: 'a',
          name: 'first',
          title: 'A',
          fields: [{ id: 'f', name: 'next', title: 'N', type: 'link', to: 'b' }],
        },
        {
          id: 'b',
          name: 'second',
          title: 'B',
          fields: [{ id: 'g', name: 'label', title: 'L', type: 'string' }],
        },
      ],
      relations: [],
    });
    const [first, second] = entitiesOf(migrated(doc)).entities as { id: string; fields: Json[] }[];
    expect(first?.fields[0]).toMatchObject({ options: { target: second?.id } });
  });

  it('maps the legacy relation kinds, restricts deletion and follows the entity ids', () => {
    const kinds = ['one-to-one', 'one-to-many', 'many-to-many'];
    const doc = v0({
      relations: kinds.map((kind, i) => ({ id: `r${i}`, from: 'e1', to: 'e2', kind })),
    });
    const { entities, relations } = entitiesOf(migrated(doc));
    expect(relations.map((r) => r['cardinality'])).toEqual(['1-1', '1-N', 'N-N']);
    expect(relations.every((r) => r['onDelete'] === 'restrict')).toBe(true);
    expect(relations[0]).toMatchObject({
      source: entities[0]?.['id'],
      target: entities[1]?.['id'],
    });
  });
});

describe('migration v0 to v1: screens and theme', () => {
  const tree = {
    component: 'page',
    children: [
      { component: 'title', props: { text: 'A' } },
      { component: 'list', children: [{ component: 'title' }] },
    ],
  };
  const doc = () =>
    v0({
      screens: [
        { id: 's1', name: 'home', path: '/', tree },
        { id: 's2', name: 'about', path: '/about', tree: { component: 'title' } },
      ],
    });

  it('flattens the nested tree into a map of nodes that list their children by id', () => {
    const files = migrated(doc());
    const pagePath = Object.keys(files).find(
      (path) => path.startsWith('pages/') && path !== 'pages/index.json',
    ) as string;
    const page = files[pagePath] as {
      key: string;
      route: string;
      rootNodeId: string;
      nodes: Record<string, { id: string; component: string; children: string[]; props: Json }>;
    };
    expect(page).toMatchObject({ key: 'home', route: '/', params: [], guards: [] });
    const nodes = Object.values(page.nodes);
    expect(nodes).toHaveLength(4);
    const root = page.nodes[page.rootNodeId];
    expect(root?.component).toBe('structure.page@1');
    expect(root?.children).toHaveLength(2);
    const [title, list] = (root?.children ?? []).map((id) => page.nodes[id]);
    expect(title).toMatchObject({ component: 'info.title@1', props: { text: 'A' }, children: [] });
    expect(list?.component).toBe('data.list@1');
    expect(page.nodes[list?.children[0] ?? '']?.component).toBe('info.title@1');
    expect(Object.entries(page.nodes).every(([key, node]) => key === node.id)).toBe(true);
  });

  it('lists the routes, starts on the first screen, and declares the components used, sorted', () => {
    const files = migrated(doc());
    const index = files['pages/index.json'] as {
      routes: { pageId: string; route: string }[];
      initialPageId: string;
      menus: unknown[];
    };
    expect(index.routes.map((r) => r.route)).toEqual(['/', '/about']);
    expect(index.initialPageId).toBe(index.routes[0]?.pageId);
    expect(index.menus).toEqual([]);
    const manifest = files['project.json'] as { dependencies: { components: string[] } };
    expect(manifest.dependencies.components).toEqual([
      'data.list@1',
      'info.title@1',
      'structure.page@1',
    ]);
  });

  it('turns colors and dark into the light and dark modes of a theme', () => {
    const files = migrated(
      v0({
        theme: {
          name: 'Sombre',
          colors: { 'color.surface': '#fff' },
          dark: { 'color.surface': '#000' },
        },
      }),
    );
    const themePath = Object.keys(files).find((path) => path.startsWith('themes/')) as string;
    expect(files[themePath]).toMatchObject({
      name: 'Sombre',
      tokens: {},
      modes: { light: { 'color.surface': '#fff' }, dark: { 'color.surface': '#000' } },
      assets: {},
    });
    const manifest = files['project.json'] as {
      project: { defaultThemeId: string };
      entries: { themes: string[] };
    };
    expect(manifest.entries.themes).toEqual([themePath]);
    expect((files[themePath] as { id: string }).id).toBe(manifest.project.defaultThemeId);
    const defaulted = migrated();
    const light = Object.keys(defaulted).find((path) => path.startsWith('themes/')) as string;
    expect((defaulted[light] as { modes: { dark: Json } }).modes.dark).toEqual({});
  });

  it('adds empty roles and queries files, and keeps the other files of the package untouched', () => {
    const files = migrated(v0(), { 'assets/logo.png': 'bytes' });
    expect(files['schema/roles.json']).toEqual({ roles: [] });
    expect(files['queries/index.json']).toEqual({ queries: [] });
    expect(files['assets/logo.png']).toBe('bytes');
  });
});

describe('migration v0 to v1: the package that comes out', () => {
  it('is valid version 1 once opened, with real identifiers', () => {
    const result = openPackage({ 'project.json': v0() });
    expect(result.ok, JSON.stringify(result.ok ? null : result.error.details)).toBe(true);
  });

  it('never modifies the v0 package it is given', () => {
    const files = deepFreeze({ 'project.json': v0() }) as PackageFiles;
    const snapshot = structuredClone(files);
    expect(migratePackage(files).ok).toBe(true);
    expect(files).toEqual(snapshot);
  });
});

describe('migration v0 to v1: problems are reported against the v0 document', () => {
  const withField = (field: Json) =>
    v0({
      entities: [
        { id: 'e1', name: 'x', title: 'X', fields: [{ id: 'f', name: 'f', title: 'F', ...field }] },
      ],
      relations: [],
    });

  it('unknown field type, relation kind and component, at their v0 paths', () => {
    expect(issuesOf(withField({ type: 'money' }))).toEqual(['enum /entities/0/fields/0/type']);
    expect(
      issuesOf(v0({ relations: [{ id: 'r', from: 'e1', to: 'e2', kind: 'sometimes' }] })),
    ).toEqual(['enum /relations/0/kind']);
    const screens = [
      {
        id: 's',
        name: 'n',
        path: '/',
        tree: { component: 'page', children: [{ component: 'widget' }] },
      },
    ];
    expect(issuesOf(v0({ screens }))).toEqual(['enum /screens/0/tree/children/0/component']);
  });

  it('links and relations that name an entity that does not exist', () => {
    expect(issuesOf(withField({ type: 'link', to: 'nowhere' }))).toEqual([
      'reference /entities/0/fields/0/to',
    ]);
    expect(issuesOf(withField({ type: 'link' }))).toEqual(['reference /entities/0/fields/0/to']);
    expect(
      issuesOf(v0({ relations: [{ id: 'r', from: 'zz', to: 'e2', kind: 'one-to-one' }] })),
    ).toEqual(['reference /relations/0/from']);
    expect(
      issuesOf(v0({ relations: [{ id: 'r', from: 'e1', to: 'zz', kind: 'one-to-one' }] })),
    ).toEqual(['reference /relations/0/to']);
  });

  it('a missing project field, theme or screens, and two entities with the same id', () => {
    expect(issuesOf(v0({ project: { title: 'T', lang: 'fr', version: '1.0.0' } }))).toEqual([
      'required /project/code',
    ]);
    expect(issuesOf(v0({ project: 'CRM' }))).toContain('type /project');
    expect(issuesOf(v0({ theme: undefined }))).toEqual([
      'type /theme',
      'required /theme/name',
      'required /theme/colors',
    ]);
    expect(issuesOf(v0({ theme: { name: 'T', colors: 'red' } }))).toEqual(['type /theme/colors']);
    expect(issuesOf(v0({ theme: { name: 'T', colors: {}, dark: 3 } }))).toEqual([
      'type /theme/dark',
    ]);
    expect(issuesOf(v0({ screens: [] }))).toEqual(['minItems /screens']);
    expect(issuesOf(v0({ screens: undefined }))).toEqual(['required /screens']);
    expect(issuesOf(v0({ entities: 'none', relations: [] }))).toEqual(['type /entities']);
    const twice = v0({
      entities: [
        { id: 'e', name: 'a', title: 'A', fields: [] },
        { id: 'e', name: 'b', title: 'B', fields: [] },
      ],
      relations: [],
    });
    expect(issuesOf(twice)).toEqual(['duplicate /entities/1/id']);
    expect(issuesOf(v0({ entities: ['oops'], relations: [] }))).toContain('type /entities/0');
  });

  it('reports every problem at once, not only the first', () => {
    const doc = v0({
      project: { code: 'CRM', lang: 'fr', version: '1.0.0' },
      entities: [
        {
          id: 'e1',
          name: 'x',
          title: 'X',
          fields: [{ id: 'f', name: 'f', title: 'F', type: 'money' }],
        },
      ],
      relations: [{ id: 'r', from: 'e1', to: 'e1', kind: 'sometimes' }],
      screens: [],
    });
    expect(issuesOf(doc).sort()).toEqual(
      [
        'enum /entities/0/fields/0/type',
        'enum /relations/0/kind',
        'minItems /screens',
        'required /project/title',
      ].sort(),
    );
  });
});
