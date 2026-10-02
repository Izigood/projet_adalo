import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import type { MigrationContext } from '../migration-types.js';
import type { PackageFiles } from '../package-files.js';

/**
 * Migration of the first format (v0) to v1 (dossier 6.5).
 *
 * v0 is a single `project.json` with no `manifestVersion`:
 *
 *   {
 *     project:   { code, title, lang, version, author?, description? },
 *     entities:  [{ id, name, title, fields: [{ id, name, title, type, required?, decimals?, to? }] }],
 *     relations: [{ id, from, to, kind }],
 *     screens:   [{ id, name, path, tree: { component, props?, children?: [node...] } }],
 *     theme:     { name, colors: { token: value }, dark?: { token: value } }
 *   }
 *
 * - identifiers are free text (`e1`, `f2`): v1 needs UUID v7, so each one is replaced and every
 *   reference to it follows;
 * - a field is `name`/`title` (v1: `key`/`label`) and has a legacy `type`; a `link` names its
 *   target entity in `to`;
 * - screens carry a nested tree (v1: a flat map of nodes that list their children's ids);
 * - there are no roles, queries, classifications, storage mode or runtime version: v1 defaults
 *   apply (`interne`, `local`, `1.0.0`, empty lists).
 *
 * Problems in the v0 document are reported with JSON pointers into the v0 document.
 */
const FIELD_TYPES: Readonly<Record<string, string>> = {
  string: 'string',
  longtext: 'text',
  number: 'integer',
  bool: 'boolean',
  date: 'date',
  link: 'reference',
};
const RELATION_KINDS: Readonly<Record<string, string>> = {
  'one-to-one': '1-1',
  'one-to-many': '1-N',
  'many-to-many': 'N-N',
};
const COMPONENTS: Readonly<Record<string, string>> = {
  page: 'structure.page@1',
  title: 'info.title@1',
  list: 'data.list@1',
};
/** Precision given to a legacy `number` that declared decimals: v0 had no such notion. */
const LEGACY_DECIMAL_PRECISION = 18;

type Json = Record<string, unknown>;
type Found = {
  readonly file: string;
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Json;
};

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function migrateV0ToV1(
  files: PackageFiles,
  context: MigrationContext,
): Result<PackageFiles, DomainError> {
  const issues: Found[] = [];
  const report = (path: string, keyword: string, message: string) =>
    issues.push({ file: 'project.json', path, keyword, message, params: {} });

  const doc = (files['project.json'] ?? {}) as Json;
  const text = (source: unknown, key: string, path: string): string => {
    const value = isRecord(source) ? source[key] : undefined;
    if (typeof value !== 'string') {
      report(
        `${path}/${key}`,
        value === undefined ? 'required' : 'type',
        `${key} must be a string`,
      );
      return '';
    }
    return value;
  };
  const list = (source: unknown, key: string, path: string): Json[] => {
    const value = isRecord(source) ? source[key] : undefined;
    if (!Array.isArray(value)) {
      report(`${path}/${key}`, value === undefined ? 'required' : 'type', `${key} must be a list`);
      return [];
    }
    return value.map((item, index) => {
      if (!isRecord(item)) report(`${path}/${key}/${index}`, 'type', 'must be an object');
      return isRecord(item) ? item : {};
    });
  };

  // --- Read and check the v0 document -------------------------------------------------------
  const projectSource = doc['project'];
  if (!isRecord(projectSource)) report('/project', 'type', 'project must be an object');
  const code = text(projectSource, 'code', '/project');
  const title = text(projectSource, 'title', '/project');
  const lang = text(projectSource, 'lang', '/project');
  const version = text(projectSource, 'version', '/project');
  const author =
    isRecord(projectSource) && typeof projectSource['author'] === 'string'
      ? projectSource['author']
      : '';
  const description =
    isRecord(projectSource) && typeof projectSource['description'] === 'string'
      ? projectSource['description']
      : '';

  const entitySources = list(doc, 'entities', '');
  const entityIds = new Map<string, string>();
  const entities = entitySources.map((entity, e) => {
    const legacyId = text(entity, 'id', `/entities/${e}`);
    if (entityIds.has(legacyId))
      report(`/entities/${e}/id`, 'duplicate', `entity id ${legacyId} is used twice`);
    entityIds.set(legacyId, context.newId(`entity:${legacyId}`));
    return {
      legacyId,
      id: entityIds.get(legacyId) as string,
      key: text(entity, 'name', `/entities/${e}`),
      label: text(entity, 'title', `/entities/${e}`),
      fields: list(entity, 'fields', `/entities/${e}`).map((field, f) => {
        const path = `/entities/${e}/fields/${f}`;
        const type = text(field, 'type', path);
        if (type !== '' && !(type in FIELD_TYPES))
          report(`${path}/type`, 'enum', `unknown field type ${type}`);
        return {
          source: field,
          path,
          type,
          legacyId: text(field, 'id', path),
          key: text(field, 'name', path),
          label: text(field, 'title', path),
        };
      }),
    };
  });

  // A link names an entity that may be declared later: check once every entity is known.
  for (const entity of entities) {
    for (const field of entity.fields) {
      const target = field.source['to'];
      if (field.type === 'link' && (typeof target !== 'string' || !entityIds.has(target))) {
        report(
          `${field.path}/to`,
          'reference',
          'a link needs the id of an existing entity in "to"',
        );
      }
    }
  }

  const relations = list(doc, 'relations', '').map((relation, r) => {
    const path = `/relations/${r}`;
    const kind = text(relation, 'kind', path);
    if (kind !== '' && !(kind in RELATION_KINDS))
      report(`${path}/kind`, 'enum', `unknown relation kind ${kind}`);
    const from = text(relation, 'from', path);
    const to = text(relation, 'to', path);
    if (from !== '' && !entityIds.has(from))
      report(`${path}/from`, 'reference', `unknown entity ${from}`);
    if (to !== '' && !entityIds.has(to)) report(`${path}/to`, 'reference', `unknown entity ${to}`);
    return { legacyId: text(relation, 'id', path), from, to, kind };
  });

  const components = new Set<string>();
  const screenSources = list(doc, 'screens', '');
  if (screenSources.length === 0 && Array.isArray(doc['screens'])) {
    report('/screens', 'minItems', 'a project needs at least one screen');
  }
  const pages = screenSources.map((screen, s) => {
    const path = `/screens/${s}`;
    const screenId = text(screen, 'id', path);
    const nodes: Record<string, Json> = {};
    const flatten = (node: unknown, nodePath: string, hint: string): string => {
      const id = context.newId(`node:${screenId}/${hint}`);
      const component = text(node, 'component', nodePath);
      if (component !== '' && !(component in COMPONENTS))
        report(`${nodePath}/component`, 'enum', `unknown component ${component}`);
      const mapped = COMPONENTS[component];
      if (mapped !== undefined) components.add(mapped);
      const props = isRecord(node) && isRecord(node['props']) ? node['props'] : {};
      const children = isRecord(node) && Array.isArray(node['children']) ? node['children'] : [];
      const childIds = children.map((child, index) =>
        flatten(
          child,
          `${nodePath}/children/${index}`,
          hint === 'root' ? String(index) : `${hint}.${index}`,
        ),
      );
      nodes[id] = { id, component: mapped ?? '', props, children: childIds };
      return id;
    };
    const rootNodeId = flatten(
      isRecord(screen) ? screen['tree'] : undefined,
      `${path}/tree`,
      'root',
    );
    return {
      id: context.newId(`page:${screenId}`),
      key: text(screen, 'name', path),
      route: text(screen, 'path', path),
      rootNodeId,
      nodes,
    };
  });

  const themeSource = doc['theme'];
  if (!isRecord(themeSource)) report('/theme', 'type', 'theme must be an object');
  const themeName = text(themeSource, 'name', '/theme');
  const colors = (key: 'colors' | 'dark', required: boolean): Json => {
    const value = isRecord(themeSource) ? themeSource[key] : undefined;
    if (value === undefined && !required) return {};
    if (!isRecord(value)) {
      report(
        `/theme/${key}`,
        value === undefined ? 'required' : 'type',
        `${key} must be an object`,
      );
      return {};
    }
    return value;
  };
  const light = colors('colors', true);
  const dark = colors('dark', false);

  if (issues.length > 0) {
    return err(
      domainError(
        'MANIFEST_INVALID',
        `the version 0 package cannot be migrated (${issues.length} issue(s))`,
        {
          details: { issues, skipped: [] },
        },
      ),
    );
  }

  // --- Build the v1 package ------------------------------------------------------------------
  const themeId = context.newId('theme');
  const entityOf = (legacyId: string) => entityIds.get(legacyId) as string;
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(files).filter(([path]) => path !== 'project.json'),
  );

  out['project.json'] = {
    manifestVersion: 1,
    project: {
      id: context.newId('project'),
      key: code,
      name: title,
      description,
      author,
      version,
      locale: lang,
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
    dependencies: { components: [...components].sort() },
  };

  out['schema/entities.json'] = {
    entities: entities.map((entity) => ({
      id: entity.id,
      key: entity.key,
      label: entity.label,
      kind: 'business',
      classification: 'interne',
      fields: entity.fields.map((field) => {
        const common = {
          id: context.newId(`field:${entity.legacyId}.${field.legacyId}`),
          key: field.key,
          label: field.label,
          required: field.source['required'] === true,
          classification: 'interne',
        };
        const decimals = field.source['decimals'];
        switch (field.type) {
          case 'number':
            return typeof decimals === 'number'
              ? {
                  ...common,
                  type: 'decimal',
                  options: { precision: LEGACY_DECIMAL_PRECISION, scale: decimals },
                }
              : { ...common, type: 'integer' };
          case 'link':
            return {
              ...common,
              type: 'reference',
              options: { target: entityOf(field.source['to'] as string) },
            };
          default:
            return { ...common, type: FIELD_TYPES[field.type] };
        }
      }),
    })),
    relations: relations.map((relation) => ({
      id: context.newId(`relation:${relation.legacyId}`),
      source: entityOf(relation.from),
      target: entityOf(relation.to),
      cardinality: RELATION_KINDS[relation.kind],
      onDelete: 'restrict',
    })),
  };
  out['schema/roles.json'] = { roles: [] };
  out['queries/index.json'] = { queries: [] };
  for (const page of pages) {
    out[`pages/${page.id}.json`] = { ...page, params: [], guards: [] };
  }
  const first = pages[0];
  out['pages/index.json'] = {
    routes: pages.map((page) => ({ pageId: page.id, route: page.route })),
    initialPageId: (first as { id: string }).id,
    menus: [],
  };
  out[`themes/${themeId}.json`] = {
    id: themeId,
    name: themeName,
    tokens: {},
    modes: { light, dark },
    assets: {},
  };
  return ok(out);
}
