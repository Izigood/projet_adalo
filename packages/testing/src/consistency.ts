import { schemaForPath } from '@acs/project-schema';
import type {
  EntitiesFile,
  PackageFiles,
  Page,
  PagesIndex,
  ProjectManifest,
  QueriesFile,
  RolesFile,
  Theme,
} from '@acs/project-schema';

/**
 * Cross-file consistency of a package that already passed schema validation: every reference
 * points at something that exists. It lets reference fixtures prove they are coherent. The
 * production validator (lot 13) will do this and more; this one is deliberately small.
 */
export function consistencyProblems(files: PackageFiles): string[] {
  const problems: string[] = [];
  const manifest = files['project.json'] as ProjectManifest;
  const entries = manifest.entries;

  for (const path of [
    entries.schema,
    entries.roles,
    entries.pages,
    entries.queries,
    ...entries.themes,
    ...entries.workflows,
  ]) {
    if (!(path in files)) problems.push(`entries: ${path} is not in the package`);
  }

  const { entities = [], relations = [] } = (files[entries.schema] ?? {}) as Partial<EntitiesFile>;
  const { roles = [] } = (files[entries.roles] ?? {}) as Partial<RolesFile>;
  const { queries = [] } = (files[entries.queries] ?? {}) as Partial<QueriesFile>;
  const index = files[entries.pages] as PagesIndex | undefined;
  const pages = Object.keys(files)
    .filter((path) => schemaForPath(path) === 'Page')
    .map((path) => files[path] as Page);
  const themes = entries.themes.map((path) => files[path] as Theme | undefined);

  const entityIds = new Set(entities.map((entity) => entity.id));
  const entityKeys = new Map(entities.map((entity) => [entity.key, entity]));
  const pageIds = new Set(pages.map((page) => page.id));

  // Identifiers are unique across the package.
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== 'object' || value === null) return;
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') {
      if (seen.has(id)) problems.push(`id ${id} is used twice`);
      seen.add(id);
    }
    Object.values(value).forEach(visit);
  };
  Object.values(files).forEach(visit);

  if (!themes.some((theme) => theme?.id === manifest.project.defaultThemeId)) {
    problems.push('project.defaultThemeId designates no theme of the package');
  }

  // Data model
  if (new Set(entities.map((entity) => entity.key)).size !== entities.length) {
    problems.push('two entities share a key');
  }
  for (const entity of entities) {
    const keys = entity.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length)
      problems.push(`entity ${entity.key}: two fields share a key`);
    for (const index of entity.indexes ?? []) {
      for (const key of index.fields) {
        if (!keys.includes(key))
          problems.push(`entity ${entity.key}: index ${index.name} uses unknown field ${key}`);
      }
    }
    for (const field of entity.fields) {
      if (field.type === 'reference' && !entityIds.has(field.options.target)) {
        problems.push(`entity ${entity.key}: field ${field.key} references an unknown entity`);
      }
      if (
        (field.type === 'choice' || field.type === 'multiChoice') &&
        field.options.source.kind === 'dictionary' &&
        !entityIds.has(field.options.source.entity)
      ) {
        problems.push(`entity ${entity.key}: field ${field.key} uses an unknown dictionary`);
      }
    }
  }
  for (const relation of relations) {
    if (!entityIds.has(relation.source) || !entityIds.has(relation.target)) {
      problems.push(`relation ${relation.id} links an unknown entity`);
    }
  }

  // Queries and roles speak in keys
  for (const query of queries) {
    const entity = entityKeys.get(query.source);
    if (entity === undefined) {
      problems.push(`query ${query.key}: unknown entity ${query.source}`);
      continue;
    }
    const keys = entity.fields.map((field) => field.key);
    const used = [
      ...(query.filter?.and.map((condition) => condition.field) ?? []),
      ...(query.sort?.map((sort) => sort.field) ?? []),
      ...(query.projection ?? []),
    ];
    for (const key of used) {
      if (!keys.includes(key)) problems.push(`query ${query.key}: unknown field ${key}`);
    }
  }
  const pageKeys = new Set(pages.map((page) => page.key));
  for (const role of roles) {
    for (const key of role.permissions.pages) {
      if (!pageKeys.has(key)) problems.push(`role ${role.key}: unknown page ${key}`);
    }
    for (const grant of role.permissions.entities) {
      const entity = entityKeys.get(grant.entity);
      if (entity === undefined) {
        problems.push(`role ${role.key}: unknown entity ${grant.entity}`);
        continue;
      }
      for (const rule of grant.fields ?? []) {
        if (!entity.fields.some((field) => field.key === rule.field)) {
          problems.push(`role ${role.key}: unknown field ${rule.field} of ${grant.entity}`);
        }
      }
    }
  }

  // Pages
  if (index !== undefined) {
    if (!pageIds.has(index.initialPageId)) problems.push('pages/index.json: unknown initial page');
    for (const route of index.routes) {
      if (!pageIds.has(route.pageId))
        problems.push(`pages/index.json: route ${route.route} has no page`);
    }
    for (const menu of index.menus) {
      for (const item of menu.items) {
        if (!pageIds.has(item.pageId))
          problems.push(`menu ${menu.key}: item ${item.label} has no page`);
      }
    }
  }
  for (const page of pages) {
    const ids = new Set(Object.keys(page.nodes));
    if (!ids.has(page.rootNodeId)) problems.push(`page ${page.key}: unknown root node`);
    for (const [key, node] of Object.entries(page.nodes)) {
      if (key !== node.id)
        problems.push(`page ${page.key}: node stored under ${key} has id ${node.id}`);
      for (const child of node.children) {
        if (!ids.has(child))
          problems.push(`page ${page.key}: node ${node.id} has unknown child ${child}`);
      }
      if (!manifest.dependencies.components.includes(node.component)) {
        problems.push(`page ${page.key}: component ${node.component} is not a declared dependency`);
      }
    }
  }
  return problems;
}
