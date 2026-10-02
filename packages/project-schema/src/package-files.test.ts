import { isDomainError, newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { schemaForPath, validateFiles } from './index.js';
import type { FileIssue, FilesValidationDetails, PackageFiles } from './index.js';

const themeId = newId<'theme'>();
const pageId = newId<'page'>();
const nodeId = newId<'node'>();

const validPackage = (): Record<string, unknown> => ({
  'project.json': {
    manifestVersion: 1,
    project: {
      id: newId<'project'>(),
      key: 'ACS',
      name: 'Minimal',
      description: '',
      author: '',
      version: '0.1.0',
      locale: 'fr',
      defaultThemeId: themeId,
      storageMode: 'local',
    },
    runtime: { minVersion: '1.0.0' },
    entries: {
      schema: 'schema/entities.json',
      roles: 'schema/roles.json',
      pages: 'pages/index.json',
      queries: 'queries/index.json',
      themes: [`themes/${themeId}.json`],
      workflows: [],
    },
    dependencies: { components: ['info.title@1'] },
  },
  'schema/entities.json': { entities: [], relations: [] },
  'schema/roles.json': { roles: [] },
  'pages/index.json': {
    routes: [{ pageId, route: '/' }],
    initialPageId: pageId,
    menus: [],
  },
  [`pages/${pageId}.json`]: {
    id: pageId,
    key: 'home',
    route: '/',
    params: [],
    rootNodeId: nodeId,
    guards: [],
    nodes: { [nodeId]: { id: nodeId, component: 'info.title@1', props: {}, children: [] } },
  },
  'queries/index.json': { queries: [] },
  [`themes/${themeId}.json`]: {
    id: themeId,
    name: 'Défaut',
    tokens: { 'space.1': '0.25rem' },
    modes: { light: {}, dark: {} },
    assets: {},
  },
});

function failure(files: PackageFiles): { issues: FileIssue[]; skipped: string[] } {
  const result = validateFiles(files);
  expect(result.ok).toBe(false);
  if (result.ok) return { issues: [], skipped: [] };
  expect(isDomainError(result.error)).toBe(true);
  expect(result.error.code).toBe('MANIFEST_INVALID');
  const details = result.error.details as unknown as FilesValidationDetails;
  return { issues: [...details.issues], skipped: [...details.skipped] };
}

const found = (issues: FileIssue[]) => issues.map((i) => `${i.file} ${i.keyword} ${i.path}`);

describe('schemaForPath', () => {
  it('maps each file of the package layout (dossier 6.1) to its schema', () => {
    const id = newId<'page'>();
    expect(schemaForPath('project.json')).toBe('ProjectManifest');
    expect(schemaForPath('schema/entities.json')).toBe('EntitiesFile');
    expect(schemaForPath('schema/roles.json')).toBe('RolesFile');
    expect(schemaForPath('pages/index.json')).toBe('PagesIndex');
    expect(schemaForPath(`pages/${id}.json`)).toBe('Page');
    expect(schemaForPath('queries/index.json')).toBe('QueriesFile');
    expect(schemaForPath(`themes/${id}.json`)).toBe('Theme');
    expect(schemaForPath(`workflows/${id}.json`)).toBe('Workflow');
  });

  it('knows nothing about other paths, including look-alikes and traversal', () => {
    const id = newId<'page'>();
    for (const path of [
      'README.md',
      'integrity.json',
      'assets/logo.png',
      'pages/not-an-id.json',
      `pages/${id}.json.bak`,
      `pages/sub/${id}.json`,
      `../pages/${id}.json`,
      '../project.json',
      'schema/other.json',
      'themes/index.json',
      'PROJECT.JSON',
      '/project.json',
      '',
    ]) {
      expect(schemaForPath(path), path).toBeUndefined();
    }
  });
});

describe('validateFiles', () => {
  it('accepts a valid package and returns it unchanged', () => {
    const files = validPackage();
    expect(validateFiles(files)).toEqual({ ok: true, value: files });
  });

  it('ignores files without a schema and lists them', () => {
    const files = {
      ...validPackage(),
      'README.md': 'text',
      'assets/a.png': 'bytes',
      '../x.json': {},
    };
    const result = validateFiles(files);
    expect(result.ok).toBe(true);
    const broken = { ...files, 'schema/roles.json': { roles: 'none' } };
    expect(failure(broken).skipped).toEqual(['../x.json', 'README.md', 'assets/a.png']);
  });

  it('requires project.json', () => {
    const files = Object.fromEntries(
      Object.entries(validPackage()).filter(([file]) => file !== 'project.json'),
    );
    expect(found(failure(files).issues)).toEqual(['project.json missing-file /']);
    expect(found(failure({}).issues)).toEqual(['project.json missing-file /']);
  });

  it('reports the file and the JSON path of an issue deep inside it', () => {
    const files = validPackage();
    files['schema/entities.json'] = {
      entities: [
        {
          id: newId<'entity'>(),
          key: 'action',
          label: 'Action',
          kind: 'business',
          fields: [
            {
              id: newId<'field'>(),
              key: 'Bad-Key',
              label: 'Titre',
              type: 'string',
              required: true,
              classification: 'public',
            },
          ],
          classification: 'interne',
        },
      ],
      relations: [],
    };
    expect(found(failure(files).issues)).toEqual([
      'schema/entities.json pattern /entities/0/fields/0/key',
    ]);
  });

  it('reports the problems of several files at once, in path order', () => {
    const files = validPackage();
    files['schema/roles.json'] = { roles: 'none' };
    files['queries/index.json'] = { queries: [{ key: 'q' }] };
    files[`pages/${pageId}.json`] = { ...(files[`pages/${pageId}.json`] as object), route: 'home' };
    expect(found(failure(files).issues).sort()).toEqual(
      [
        `pages/${pageId}.json pattern /route`,
        'queries/index.json required /queries/0/id',
        'queries/index.json required /queries/0/source',
        'schema/roles.json type /roles',
      ].sort(),
    );
    const files2 = failure(files).issues.map((issue) => issue.file);
    expect(files2).toEqual([...files2].sort());
  });

  it('validates a file as the schema its path designates, not as another one', () => {
    const files = validPackage();
    files['pages/index.json'] = files['schema/roles.json'];
    expect(found(failure(files).issues).sort()).toEqual(
      [
        'pages/index.json required /routes',
        'pages/index.json required /initialPageId',
        'pages/index.json required /menus',
        'pages/index.json additionalProperties /roles',
      ].sort(),
    );
  });

  it('refuses a file whose content is not an object', () => {
    const files = { ...validPackage(), 'schema/entities.json': null };
    expect(found(failure(files).issues)).toEqual(['schema/entities.json type /']);
  });
});
