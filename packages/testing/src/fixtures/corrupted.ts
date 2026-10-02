import type {
  EntitiesFile,
  Page,
  PagesIndex,
  ProjectManifest,
  QueriesFile,
  RolesFile,
  Theme,
  Workflow,
} from '@acs/project-schema';
import { stableId } from '../ids.js';
import type { FixtureFiles } from '../package-builder.js';
import { completeFixture } from './complete.js';
import { referenceFixture } from './reference.js';

/**
 * Corrupted packages: each one is a valid reference fixture with one precise defect, and the
 * exact issues the validator must report for it, as `file keyword /json/pointer`. Reference
 * fixtures: change them only on purpose, never to make a test pass.
 */
export type CorruptedCategory =
  'structure' | 'data-model' | 'secrets' | 'ui' | 'workflow' | 'theme' | 'other';

export type CorruptedCase = {
  readonly name: string;
  readonly category: CorruptedCategory;
  readonly build: () => { readonly files: FixtureFiles; readonly expected: readonly string[] };
};

type Edit = (files: FixtureFiles) => string[];

const set = (target: object, key: string, value: unknown): void => {
  (target as Record<string, unknown>)[key] = value;
};
const manifest = (files: FixtureFiles) => files['project.json'] as ProjectManifest;
const entities = (files: FixtureFiles) => (files['schema/entities.json'] as EntitiesFile).entities;
const relations = (files: FixtureFiles) =>
  (files['schema/entities.json'] as EntitiesFile).relations;
const pageOf = (files: FixtureFiles, key: string): [string, Page] => {
  const path = Object.keys(files).find(
    (p) => p.startsWith('pages/') && (files[p] as Page).key === key,
  );
  if (path === undefined) throw new Error(`fixture has no page ${key}`);
  return [path, files[path] as Page];
};
const themeOf = (files: FixtureFiles): [string, Theme] => {
  const path = Object.keys(files).find((p) => p.startsWith('themes/')) as string;
  return [path, files[path] as Theme];
};
const workflowOf = (files: FixtureFiles, key: string): [string, Workflow] => {
  const path = Object.keys(files).find(
    (p) => p.startsWith('workflows/') && (files[p] as Workflow).key === key,
  );
  if (path === undefined) throw new Error(`fixture has no workflow ${key}`);
  return [path, files[path] as Workflow];
};

const reference = (name: string, category: CorruptedCategory, edit: Edit): CorruptedCase => ({
  name,
  category,
  build: () => {
    const files = referenceFixture();
    return { files, expected: edit(files) };
  },
});
const complete = (name: string, category: CorruptedCategory, edit: Edit): CorruptedCase => ({
  name,
  category,
  build: () => {
    const files = completeFixture();
    return { files, expected: edit(files) };
  },
});

export const CORRUPTED_FIXTURES: readonly CorruptedCase[] = [
  // Manifest and structure
  reference('project key in lower case (RG-11)', 'structure', (files) => {
    set(manifest(files).project, 'key', 'crm');
    return ['project.json pattern /project/key'];
  }),
  reference('project key too short', 'structure', (files) => {
    set(manifest(files).project, 'key', 'C');
    return ['project.json pattern /project/key'];
  }),
  reference('project id that is a UUID v4', 'structure', (files) => {
    set(manifest(files).project, 'id', '3f2b8c1e-5d4a-4c3b-9a1f-0123456789ab');
    return ['project.json pattern /project/id'];
  }),
  reference('manifest of a future format version', 'structure', (files) => {
    set(manifest(files), 'manifestVersion', 2);
    return ['project.json const /manifestVersion'];
  }),
  reference('manifest without entries', 'structure', (files) => {
    delete (manifest(files) as { entries?: unknown }).entries;
    return ['project.json required /entries'];
  }),
  reference('entry path that leaves the package (zip-slip)', 'structure', (files) => {
    set(manifest(files).entries, 'schema', '../evil.json');
    return ['project.json pattern /entries/schema'];
  }),
  reference('entry path with a leading slash', 'structure', (files) => {
    set(manifest(files).entries, 'pages', '/pages/index.json');
    return ['project.json pattern /entries/pages'];
  }),
  reference('remote storage mode at the MVP', 'structure', (files) => {
    set(manifest(files).project, 'storageMode', 'remote');
    return ['project.json enum /project/storageMode'];
  }),
  reference('locale written as a word', 'structure', (files) => {
    set(manifest(files).project, 'locale', 'francais');
    return ['project.json pattern /project/locale'];
  }),

  // Data model
  reference('entity key in upper case', 'data-model', (files) => {
    set(entities(files)[0] as object, 'key', 'Customer');
    return ['schema/entities.json pattern /entities/0/key'];
  }),
  reference('field key with a hyphen', 'data-model', (files) => {
    set(entities(files)[1]?.fields[1] as object, 'key', 'order-amount');
    return ['schema/entities.json pattern /entities/1/fields/1/key'];
  }),
  reference('entity without any field', 'data-model', (files) => {
    set(entities(files)[0] as object, 'fields', []);
    return ['schema/entities.json minItems /entities/0/fields'];
  }),
  reference('decimal field without precision and scale (D-07)', 'data-model', (files) => {
    const amount = entities(files)[1]?.fields[1] as object;
    delete (amount as { options?: unknown }).options;
    return ['schema/entities.json required /entities/1/fields/1/options'];
  }),
  reference('decimal precision of zero', 'data-model', (files) => {
    set((entities(files)[1]?.fields[1] as { options: object }).options, 'precision', 0);
    return ['schema/entities.json minimum /entities/1/fields/1/options/precision'];
  }),
  reference('choice with an empty list', 'data-model', (files) => {
    const status = entities(files)[1]?.fields[2] as { options: { source: object } };
    set(status.options.source, 'values', []);
    return ['schema/entities.json minItems /entities/1/fields/2/options/source/values'];
  }),
  reference('reference field that designates its target by label', 'data-model', (files) => {
    set((entities(files)[1]?.fields[0] as { options: object }).options, 'target', 'customer');
    return ['schema/entities.json pattern /entities/1/fields/0/options/target'];
  }),
  reference('relation with an unknown cardinality', 'data-model', (files) => {
    set(relations(files)[0] as object, 'cardinality', 'N-1');
    return ['schema/entities.json enum /relations/0/cardinality'];
  }),
  reference('relation that designates an entity by label', 'data-model', (files) => {
    set(relations(files)[0] as object, 'source', 'customer');
    return ['schema/entities.json pattern /relations/0/source'];
  }),
  reference('classification outside public, interne and sensible', 'data-model', (files) => {
    set(entities(files)[0] as object, 'classification', 'secret');
    return ['schema/entities.json enum /entities/0/classification'];
  }),

  // Secrets (EF-SEC-04, SEC-06)
  reference('a field of type secret', 'secrets', (files) => {
    set(entities(files)[0]?.fields[0] as object, 'type', 'secret');
    return ['schema/entities.json discriminator /entities/0/fields/0'];
  }),
  reference('a field of type password', 'secrets', (files) => {
    set(entities(files)[0]?.fields[0] as object, 'type', 'password');
    return ['schema/entities.json discriminator /entities/0/fields/0'];
  }),
  reference('a password property on a field', 'secrets', (files) => {
    set(entities(files)[0]?.fields[0] as object, 'password', 'hunter2');
    return ['schema/entities.json additionalProperties /entities/0/fields/0/password'];
  }),
  reference('a password property on the project', 'secrets', (files) => {
    set(manifest(files).project, 'password', 'hunter2');
    return ['project.json additionalProperties /project/password'];
  }),
  reference('a secret property on an entity', 'secrets', (files) => {
    set(entities(files)[0] as object, 'secret', true);
    return ['schema/entities.json additionalProperties /entities/0/secret'];
  }),
  complete('a secret value next to its reference', 'secrets', (files) => {
    set((manifest(files).secretRefs as object[])[0] as object, 'value', 'hunter2');
    return ['project.json additionalProperties /secretRefs/0/value'];
  }),
  complete('a secret reference without key', 'secrets', (files) => {
    delete ((manifest(files).secretRefs as { key?: string }[])[1] as { key?: string }).key;
    return ['project.json required /secretRefs/1/key'];
  }),

  // Pages and UI tree
  reference('page route without a leading slash', 'ui', (files) => {
    const [path, page] = pageOf(files, 'orders');
    set(page, 'route', 'orders');
    return [`${path} pattern /route`];
  }),
  reference('node that lists a child by label', 'ui', (files) => {
    const [path, page] = pageOf(files, 'orders');
    set(page.nodes[page.rootNodeId]?.children as object, '0', 'header');
    return [`${path} pattern /nodes/${page.rootNodeId}/children/0`];
  }),
  reference('component reference without a major version', 'ui', (files) => {
    const [path, page] = pageOf(files, 'orders');
    set(page.nodes[page.rootNodeId] as object, 'component', 'structure.page');
    return [`${path} pattern /nodes/${page.rootNodeId}/component`];
  }),
  reference('node stored under a key that is not an identifier', 'ui', (files) => {
    const [path, page] = pageOf(files, 'orders');
    const root = page.nodes[page.rootNodeId];
    delete page.nodes[page.rootNodeId];
    set(page.nodes, 'root', root);
    return [`${path} additionalProperties /nodes/root`];
  }),
  reference('guard of an unknown kind', 'ui', (files) => {
    const [path, page] = pageOf(files, 'orders');
    set(page.guards, '0', { kind: 'ip', allow: '10.0.0.0/8' });
    return [`${path} discriminator /guards/0`];
  }),
  reference('pages index that names its initial page by key', 'ui', (files) => {
    set(files['pages/index.json'] as PagesIndex, 'initialPageId', 'home');
    return ['pages/index.json pattern /initialPageId'];
  }),

  // Workflows
  complete('workflow node of a post-MVP type', 'workflow', (files) => {
    const [path, workflow] = workflowOf(files, 'closeTicket');
    set(workflow.nodes[0] as object, 'type', 'connectorCall');
    return [`${path} enum /nodes/0/type`];
  }),
  complete('workflow edge that designates a node by label', 'workflow', (files) => {
    const [path, workflow] = workflowOf(files, 'closeTicket');
    set(workflow.edges[0] as object, 'from', 'start');
    return [`${path} pattern /edges/0/from`];
  }),
  complete('workflow with ninety-nine retries', 'workflow', (files) => {
    const [path, workflow] = workflowOf(files, 'closeTicket');
    set(workflow.errorPolicy, 'retries', 99);
    return [`${path} maximum /errorPolicy/retries`];
  }),

  // Themes (the values end up in CSS)
  complete('theme token that loads a remote resource', 'theme', (files) => {
    const [path, theme] = themeOf(files);
    set(theme.tokens, 'color.evil', 'url(https://evil.example/x.png)');
    return [`${path} pattern /tokens/color.evil`];
  }),
  complete('theme token that closes the CSS rule', 'theme', (files) => {
    const [path, theme] = themeOf(files);
    set(theme.modes.dark, 'color.surface', 'red; } body { display: none');
    return [`${path} pattern /modes/dark/color.surface`];
  }),
  complete('theme asset outside the assets folder', 'theme', (files) => {
    const [path, theme] = themeOf(files);
    set(theme.assets, 'logo', '../logo.png');
    return [`${path} pattern /assets/logo`];
  }),

  // Others
  reference('query with a page size above 500', 'other', (files) => {
    set((files['queries/index.json'] as QueriesFile).queries[0]?.page as object, 'size', 501);
    return ['queries/index.json maximum /queries/0/page/size'];
  }),
  reference('role that grants an unknown operation', 'other', (files) => {
    set(
      (files['schema/roles.json'] as RolesFile).roles[0]?.permissions.entities[0]
        ?.operations as object,
      '0',
      'drop',
    );
    return ['schema/roles.json enum /roles/0/permissions/entities/0/operations/0'];
  }),
  reference('a file that is not an object', 'other', (files) => {
    files['queries/index.json'] = null;
    return ['queries/index.json type /'];
  }),
  reference('a package without project.json', 'other', (files) => {
    delete files['project.json'];
    return ['project.json missing-file /'];
  }),
  reference('three files damaged at once', 'other', (files) => {
    set(manifest(files).project, 'key', 'crm');
    set(entities(files)[0] as object, 'key', 'Customer');
    set((files['schema/roles.json'] as RolesFile).roles[0] as object, 'key', 'Editor');
    return [
      'project.json pattern /project/key',
      'schema/entities.json pattern /entities/0/key',
      'schema/roles.json pattern /roles/0/key',
    ];
  }),
  reference('an identifier nobody asked for (stable id sanity)', 'other', (files) => {
    set(manifest(files).project, 'defaultThemeId', stableId('nowhere').toUpperCase());
    return ['project.json pattern /project/defaultThemeId'];
  }),
];
