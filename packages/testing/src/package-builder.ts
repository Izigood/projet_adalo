import type {
  Entity,
  Page,
  PagesIndex,
  Project,
  Query,
  Relation,
  Role,
  SecretRef,
  Theme,
  Workflow,
} from '@acs/project-schema';

/** The files of a fixture. Each fixture call returns a fresh copy, so tests may modify it. */
export type FixtureFiles = Record<string, unknown>;

/** The documents of a project; the file layout (dossier 6.1) is computed from them. */
export type FixtureDocuments = {
  readonly project: Project;
  readonly entities: readonly Entity[];
  readonly relations: readonly Relation[];
  readonly roles: readonly Role[];
  readonly pages: readonly Page[];
  readonly pagesIndex: PagesIndex;
  readonly queries: readonly Query[];
  readonly themes: readonly Theme[];
  readonly workflows: readonly Workflow[];
  /** Components the project uses, as `famille.nom@majeure`. */
  readonly components: readonly string[];
  readonly secretRefs?: readonly SecretRef[];
};

/** Lays the documents out as the files of a package, `entries` included. */
export function buildPackage(documents: FixtureDocuments): FixtureFiles {
  const themePaths = documents.themes.map((theme) => `themes/${theme.id}.json`);
  const workflowPaths = documents.workflows.map((workflow) => `workflows/${workflow.id}.json`);
  const files: Record<string, unknown> = {
    'project.json': {
      manifestVersion: 1,
      project: documents.project,
      runtime: { minVersion: '1.0.0' },
      entries: {
        schema: 'schema/entities.json',
        roles: 'schema/roles.json',
        pages: 'pages/index.json',
        queries: 'queries/index.json',
        themes: themePaths,
        workflows: workflowPaths,
      },
      dependencies: { components: [...documents.components] },
      ...(documents.secretRefs === undefined ? {} : { secretRefs: [...documents.secretRefs] }),
    },
    'schema/entities.json': {
      entities: [...documents.entities],
      relations: [...documents.relations],
    },
    'schema/roles.json': { roles: [...documents.roles] },
    'pages/index.json': documents.pagesIndex,
    'queries/index.json': { queries: [...documents.queries] },
  };
  for (const page of documents.pages) files[`pages/${page.id}.json`] = page;
  documents.themes.forEach((theme, index) => (files[themePaths[index] as string] = theme));
  documents.workflows.forEach(
    (workflow, index) => (files[workflowPaths[index] as string] = workflow),
  );
  return files;
}
