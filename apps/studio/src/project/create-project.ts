import { baseTokens, darkTokens, lightTokens } from '@acs/design-system';
import { newId } from '@acs/domain';
import type { DomainError, Id, Result } from '@acs/domain';
import type { Page, Theme } from '@acs/project-schema';
import { t } from '../i18n.js';
import { fromFiles } from './project-state.js';
import type { ProjectState } from './project-state.js';

/** What the person gives to create a project (EF-PRJ-01); the rest has a default. */
export type NewProject = {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly author?: string;
  readonly locale?: string;
};

type Generate = <Kind extends string>() => Id<Kind>;

/**
 * Creates a project: its metadata, the default theme (the design system's tokens), and one page,
 * the first one shown, that carries a title. It is a package that passes the schemas, or an error
 * that says which field is wrong (`details.issues`, with the file and the JSON Pointer): the same
 * check as for a package that is imported.
 */
export function createProject(
  input: NewProject,
  generate: Generate = newId,
): Result<ProjectState, DomainError> {
  const themeId = generate<'theme'>();
  const pageId = generate<'page'>();
  const titleId = generate<'node'>();

  const theme: Theme = {
    id: themeId,
    name: t('project.defaultTheme'),
    tokens: { ...baseTokens },
    modes: { light: { ...lightTokens }, dark: { ...darkTokens } },
    assets: {},
  };
  const home: Page = {
    id: pageId,
    key: 'home',
    route: '/',
    params: [],
    rootNodeId: titleId,
    guards: [],
    nodes: {
      [titleId]: {
        id: titleId,
        component: 'info.title@1',
        props: { text: input.name },
        children: [],
      },
    },
  };

  return fromFiles({
    'project.json': {
      manifestVersion: 1,
      project: {
        id: generate<'project'>(),
        key: input.key,
        name: input.name,
        description: input.description ?? '',
        author: input.author ?? '',
        version: '0.1.0',
        locale: input.locale ?? 'fr-FR',
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
    'queries/index.json': { queries: [] },
    [`pages/${pageId}.json`]: home,
    [`themes/${themeId}.json`]: theme,
  });
}
