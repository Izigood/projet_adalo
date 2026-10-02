import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { CURRENT_MANIFEST_VERSION, ENTITY_OPERATIONS, FIELD_ACCESS, validate } from './index.js';
import type { Issue, SchemaName } from './index.js';

const without = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

function issuesOf(name: SchemaName, document: unknown): string[] {
  const result = validate(name, document);
  if (result.ok) return [];
  return (result.error.details as { issues: Issue[] }).issues.map(
    (issue) => `${issue.keyword} ${issue.path}`,
  );
}

const project = () => ({
  id: newId<'project'>(),
  key: 'ACS',
  name: 'App Canvas Studio',
  description: '',
  author: 'dlartigue',
  version: '1.0.0',
  locale: 'fr-FR',
  defaultThemeId: newId<'theme'>(),
  storageMode: 'local',
});

const manifest = (extra: Record<string, unknown> = {}) => ({
  manifestVersion: 1,
  project: project(),
  runtime: { minVersion: '1.0.0' },
  entries: {
    schema: 'schema/entities.json',
    roles: 'schema/roles.json',
    pages: 'pages/index.json',
    queries: 'queries/index.json',
    themes: ['themes/default.json'],
    workflows: [],
  },
  dependencies: { components: ['structure.page@1', 'data.list@1'] },
  ...extra,
});

describe('project manifest (project.json)', () => {
  it('accepts a complete manifest, with and without secret references', () => {
    expect(issuesOf('ProjectManifest', manifest())).toEqual([]);
    const withSecrets = manifest({
      secretRefs: [{ id: newId<'secretRef'>(), key: 'smtpPassword', description: 'Serveur SMTP' }],
    });
    expect(issuesOf('ProjectManifest', withSecrets)).toEqual([]);
  });

  it('writes the current format version, 1', () => {
    expect(CURRENT_MANIFEST_VERSION).toBe(1);
    expect(issuesOf('ProjectManifest', manifest({ manifestVersion: 2 }))).toEqual([
      'const /manifestVersion',
    ]);
    expect(issuesOf('ProjectManifest', manifest({ manifestVersion: 0 }))).toEqual([
      'const /manifestVersion',
    ]);
    // A string is both the wrong type and the wrong constant: Ajv reports both.
    expect(issuesOf('ProjectManifest', manifest({ manifestVersion: '1' })).sort()).toEqual([
      'const /manifestVersion',
      'type /manifestVersion',
    ]);
  });

  it('reports a problem in the project at the path of the property', () => {
    expect(
      issuesOf('ProjectManifest', manifest({ project: { ...project(), key: 'acs' } })),
    ).toEqual(['pattern /project/key']);
  });

  it('requires every part, and refuses anything else such as a password', () => {
    for (const name of ['manifestVersion', 'project', 'runtime', 'entries', 'dependencies']) {
      expect(issuesOf('ProjectManifest', without(manifest(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('ProjectManifest', manifest({ password: 'x' }))).toEqual([
      'additionalProperties /password',
    ]);
  });

  it('refuses entry paths that leave the package or are not JSON files (zip-slip, SEC-01)', () => {
    const bad = [
      '../evil.json',
      'schema/../../evil.json',
      '/etc/passwd.json',
      'schema\\entities.json',
      'schema/entities.js',
      'schema/entities',
      '',
      'schema/entit\u0000ies.json',
      `${'a/'.repeat(100)}x.json`,
    ];
    for (const schema of bad) {
      const document = manifest({ entries: { ...manifest().entries, schema } });
      expect(issuesOf('ProjectManifest', document), JSON.stringify(schema)).toEqual([
        'pattern /entries/schema',
      ]);
    }
  });

  it('needs at least one theme, and valid theme and workflow paths', () => {
    const entries = manifest().entries;
    expect(issuesOf('ProjectManifest', manifest({ entries: { ...entries, themes: [] } }))).toEqual([
      'minItems /entries/themes',
    ]);
    expect(
      issuesOf('ProjectManifest', manifest({ entries: { ...entries, workflows: ['../x.json'] } })),
    ).toEqual(['pattern /entries/workflows/0']);
  });

  it('refuses a malformed component dependency or runtime version', () => {
    expect(
      issuesOf('ProjectManifest', manifest({ dependencies: { components: ['data.list'] } })),
    ).toEqual(['pattern /dependencies/components/0']);
    expect(issuesOf('ProjectManifest', manifest({ runtime: { minVersion: '1' } }))).toEqual([
      'pattern /runtime/minVersion',
    ]);
  });

  it('refuses a secret value next to a reference (EF-SEC-04)', () => {
    const smuggled = manifest({
      secretRefs: [
        { id: newId<'secretRef'>(), key: 'smtpPassword', description: '', value: 'hunter2' },
      ],
    });
    expect(issuesOf('ProjectManifest', smuggled)).toEqual([
      'additionalProperties /secretRefs/0/value',
    ]);
  });
});

describe('role', () => {
  const role = (extra: Record<string, unknown> = {}) => ({
    id: newId<'role'>(),
    key: 'editor',
    label: 'Éditeur',
    permissions: {
      pages: ['home', 'actions'],
      actions: ['export'],
      entities: [
        {
          entity: 'action',
          operations: ['read', 'update'],
          fields: [{ field: 'status', access: 'readonly' }],
        },
      ],
    },
    ...extra,
  });

  it('accepts a role with page, action, entity and field permissions', () => {
    expect(issuesOf('Role', role())).toEqual([]);
    const empty = role({ permissions: { pages: [], actions: [], entities: [] } });
    expect(issuesOf('Role', empty)).toEqual([]);
  });

  it('accepts every operation and every field access', () => {
    for (const operation of ENTITY_OPERATIONS) {
      const permissions = {
        pages: [],
        actions: [],
        entities: [{ entity: 'a', operations: [operation] }],
      };
      expect(issuesOf('Role', role({ permissions }))).toEqual([]);
    }
    for (const access of FIELD_ACCESS) {
      const permissions = {
        pages: [],
        actions: [],
        entities: [{ entity: 'a', operations: ['read'], fields: [{ field: 'f', access }] }],
      };
      expect(issuesOf('Role', role({ permissions }))).toEqual([]);
    }
  });

  it('points at the permission that is wrong', () => {
    const entity = (extra: Record<string, unknown>) =>
      role({
        permissions: {
          pages: [],
          actions: [],
          entities: [{ entity: 'a', operations: ['read'], ...extra }],
        },
      });
    expect(issuesOf('Role', entity({ operations: [] }))).toEqual([
      'minItems /permissions/entities/0/operations',
    ]);
    expect(issuesOf('Role', entity({ operations: ['drop'] }))).toEqual([
      'enum /permissions/entities/0/operations/0',
    ]);
    expect(issuesOf('Role', entity({ fields: [{ field: 'f', access: 'write' }] }))).toEqual([
      'enum /permissions/entities/0/fields/0/access',
    ]);
    expect(
      issuesOf('Role', role({ permissions: { pages: ['Bad Page'], actions: [], entities: [] } })),
    ).toEqual(['pattern /permissions/pages/0']);
  });

  it('requires id, key, label and the three permission lists, and refuses extras', () => {
    for (const name of ['id', 'key', 'label', 'permissions']) {
      expect(issuesOf('Role', without(role(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('Role', role({ permissions: { pages: [], actions: [] } }))).toEqual([
      'required /permissions/entities',
    ]);
    expect(issuesOf('Role', role({ superuser: true }))).toEqual([
      'additionalProperties /superuser',
    ]);
  });
});

describe('package files', () => {
  const entity = () => ({
    id: newId<'entity'>(),
    key: 'action',
    label: 'Action',
    kind: 'business',
    fields: [
      {
        id: newId<'field'>(),
        key: 'title',
        label: 'Titre',
        type: 'string',
        required: true,
        classification: 'public',
      },
    ],
    classification: 'interne',
  });
  const relation = () => ({
    id: newId<'relation'>(),
    source: newId<'entity'>(),
    target: newId<'entity'>(),
    cardinality: '1-N',
    onDelete: 'restrict',
  });

  it('entities.json accepts entities with relations, or nothing at all', () => {
    expect(issuesOf('EntitiesFile', { entities: [entity()], relations: [relation()] })).toEqual([]);
    expect(issuesOf('EntitiesFile', { entities: [], relations: [] })).toEqual([]);
  });

  it('entities.json reports problems deep inside at the exact path', () => {
    const badEntity = entity();
    badEntity.fields[0] = { ...badEntity.fields[0], key: 'Bad-Key' } as never;
    expect(issuesOf('EntitiesFile', { entities: [entity(), badEntity], relations: [] })).toEqual([
      'pattern /entities/1/fields/0/key',
    ]);
    expect(
      issuesOf('EntitiesFile', {
        entities: [],
        relations: [{ ...relation(), cardinality: 'N-1' }],
      }),
    ).toEqual(['enum /relations/0/cardinality']);
    expect(issuesOf('EntitiesFile', { entities: [] })).toEqual(['required /relations']);
  });

  it('roles.json and queries.json wrap their lists and refuse extras', () => {
    expect(issuesOf('RolesFile', { roles: [] })).toEqual([]);
    expect(issuesOf('RolesFile', { roles: [{ key: 'x' }] }).sort()).toEqual(
      ['required /roles/0/id', 'required /roles/0/label', 'required /roles/0/permissions'].sort(),
    );
    const query = { id: newId<'query'>(), key: 'all', source: 'action' };
    expect(issuesOf('QueriesFile', { queries: [query] })).toEqual([]);
    expect(issuesOf('QueriesFile', { queries: [query], extra: 1 })).toEqual([
      'additionalProperties /extra',
    ]);
  });
});
