import { domainError, err, ok } from '@acs/domain';
import type { CatalogSummary, DomainError, Id, PackageFiles, Result } from '@acs/domain';
import { validateFiles } from '@acs/project-schema';
import type {
  PackageFiles as ParsedFiles,
  Entity,
  Page,
  PagesIndex,
  Project,
  ProjectManifest,
  Query,
  Relation,
  Role,
  SecretRef,
  Theme,
  Workflow,
} from '@acs/project-schema';

/** A set of objects of one kind: by identifier, and in the order the package gives them. */
export type Collection<T> = {
  readonly byId: Readonly<Record<string, T>>;
  readonly order: readonly string[];
};

/**
 * A project as the Studio holds it (ARC-STU-01): the files of the package, normalised. Every
 * object is reached by its identifier, never by its position or its label, and a node of a page is
 * already reached that way inside the page. `toFiles(fromFiles(files))` gives back the same files
 * (the tests hold every reference fixture to it), so that saving and reloading changes nothing.
 */
export type ProjectState = {
  readonly manifestVersion: number;
  readonly project: Project;
  readonly runtimeMinVersion: string;
  /** Components the project uses, as `famille.nom@majeure`. */
  readonly components: readonly string[];
  readonly secretRefs?: readonly SecretRef[];
  readonly entities: Collection<Entity>;
  readonly relations: Collection<Relation>;
  readonly roles: Collection<Role>;
  readonly queries: Collection<Query>;
  readonly pages: Collection<Page>;
  readonly themes: Collection<Theme>;
  readonly workflows: Collection<Workflow>;
  readonly routes: PagesIndex['routes'];
  readonly initialPageId: Id<'page'>;
  readonly menus: PagesIndex['menus'];
  /** Where `project.json` says the schema, the roles, the pages index and the queries are. */
  readonly entryPaths: {
    readonly schema: string;
    readonly roles: string;
    readonly pages: string;
    readonly queries: string;
  };
  /** Files the Studio does not edit (assets, test data, README...): kept as they are. */
  readonly extraFiles: Readonly<Record<string, unknown>>;
};

const PAGE_FILE = /^pages\/[^/]+\.json$/;

function collect<T extends { readonly id: string }>(items: readonly T[]): Collection<T> {
  return {
    byId: Object.fromEntries(items.map((item) => [item.id, item])),
    order: items.map((item) => item.id),
  };
}

function listed<T>(collection: Collection<T>): T[] {
  return collection.order.flatMap((id) => {
    const item = collection.byId[id];
    return item === undefined ? [] : [item];
  });
}

/** Reads the files of a package that has passed the schemas into the normalised state. */
export function fromFiles(files: ParsedFiles): Result<ProjectState, DomainError> {
  const valid = validateFiles(files);
  if (!valid.ok) return valid;
  return readState(files);
}

/**
 * Reads files the Studio wrote itself (`toFiles`) back into the state, without applying the
 * schemas: a draft is a project that did not pass them (RG-13), and it must still be reopened to be
 * mended. Files that do not have the layout `toFiles` gives are an error, never a crash.
 */
export function readFiles(files: ParsedFiles): Result<ProjectState, DomainError> {
  try {
    return readState(files);
  } catch (cause) {
    return err(
      domainError('MANIFEST_INVALID', 'the files cannot be read as a project', {
        details: { cause: String(cause) },
      }),
    );
  }
}

function readState(files: ParsedFiles): Result<ProjectState, DomainError> {
  const manifest = files['project.json'] as unknown as ProjectManifest;
  const wanted = [
    manifest.entries.schema,
    manifest.entries.roles,
    manifest.entries.pages,
    manifest.entries.queries,
    ...manifest.entries.themes,
    ...manifest.entries.workflows,
  ];
  const missing = wanted.filter((path) => !Object.hasOwn(files, path));
  if (missing.length > 0) {
    return err(
      domainError('MANIFEST_INVALID', `project.json names files the package does not have`, {
        details: { missing },
      }),
    );
  }

  const read = <T>(path: string): T => files[path] as unknown as T;
  const schema = read<{ entities: Entity[]; relations: Relation[] }>(manifest.entries.schema);
  const pagesIndex = read<PagesIndex>(manifest.entries.pages);
  const pageFiles = Object.keys(files).filter(
    (path) => PAGE_FILE.test(path) && path !== manifest.entries.pages,
  );
  const pages = pageFiles.map((path) => read<Page>(path));
  const inRouteOrder = pagesIndex.routes.flatMap(({ pageId }) => {
    const page = pages.find((candidate) => candidate.id === pageId);
    return page === undefined ? [] : [page];
  });
  const others = pages
    .filter((page) => !inRouteOrder.includes(page))
    .sort((a, b) => a.id.localeCompare(b.id));

  const consumed = new Set<string>(['project.json', ...wanted, ...pageFiles]);
  const extraFiles = Object.fromEntries(
    Object.entries(files).filter(([path]) => !consumed.has(path)),
  );

  return ok({
    manifestVersion: manifest.manifestVersion,
    project: manifest.project,
    runtimeMinVersion: manifest.runtime.minVersion,
    components: manifest.dependencies.components,
    ...(manifest.secretRefs === undefined ? {} : { secretRefs: manifest.secretRefs }),
    entities: collect(schema.entities),
    relations: collect(schema.relations),
    roles: collect(read<{ roles: Role[] }>(manifest.entries.roles).roles),
    queries: collect(read<{ queries: Query[] }>(manifest.entries.queries).queries),
    pages: collect([...inRouteOrder, ...others]),
    themes: collect(manifest.entries.themes.map((path) => read<Theme>(path))),
    workflows: collect(manifest.entries.workflows.map((path) => read<Workflow>(path))),
    routes: pagesIndex.routes,
    initialPageId: pagesIndex.initialPageId,
    menus: pagesIndex.menus,
    entryPaths: {
      schema: manifest.entries.schema,
      roles: manifest.entries.roles,
      pages: manifest.entries.pages,
      queries: manifest.entries.queries,
    },
    extraFiles,
  });
}

/** Lays the state out as the files of a package (dossier 6.1). */
export function toFiles(state: ProjectState): PackageFiles {
  const themes = listed(state.themes);
  const workflows = listed(state.workflows);
  const themePaths = themes.map((theme) => `themes/${theme.id}.json`);
  const workflowPaths = workflows.map((workflow) => `workflows/${workflow.id}.json`);
  const files: Record<string, unknown> = {
    ...state.extraFiles,
    'project.json': {
      manifestVersion: state.manifestVersion,
      project: state.project,
      runtime: { minVersion: state.runtimeMinVersion },
      entries: {
        schema: state.entryPaths.schema,
        roles: state.entryPaths.roles,
        pages: state.entryPaths.pages,
        queries: state.entryPaths.queries,
        themes: themePaths,
        workflows: workflowPaths,
      },
      dependencies: { components: state.components },
      ...(state.secretRefs === undefined ? {} : { secretRefs: state.secretRefs }),
    },
    [state.entryPaths.schema]: {
      entities: listed(state.entities),
      relations: listed(state.relations),
    },
    [state.entryPaths.roles]: { roles: listed(state.roles) },
    [state.entryPaths.pages]: {
      routes: state.routes,
      initialPageId: state.initialPageId,
      menus: state.menus,
    },
    [state.entryPaths.queries]: { queries: listed(state.queries) },
  };
  for (const page of listed(state.pages)) files[`pages/${page.id}.json`] = page;
  themes.forEach((theme, index) => (files[themePaths[index] as string] = theme));
  workflows.forEach((workflow, index) => (files[workflowPaths[index] as string] = workflow));
  // Plain documents, by construction: the schemas that `fromFiles` applied allow nothing else.
  return files as unknown as PackageFiles;
}

/**
 * What the catalogue shows of a project. The only place it is computed, so that the summary kept
 * beside the files (ProjectStore) cannot drift from the project.
 */
export function summaryOf(state: ProjectState): CatalogSummary {
  const { id, key, name, description, author, version, locale } = state.project;
  return { id, key, name, description, author, version, locale };
}
