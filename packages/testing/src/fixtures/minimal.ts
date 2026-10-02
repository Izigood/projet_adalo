import type { Page, PagesIndex, Project, Theme } from '@acs/project-schema';
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * The smallest valid project: one page with a title, one theme, no data. It is what the Runtime
 * has to be able to show (lot 2). Reference fixture: change it only on purpose, never to make a
 * test pass.
 */
const themeId = stableId<'theme'>('minimal.theme');
const pageId = stableId<'page'>('minimal.page.home');
const titleId = stableId<'node'>('minimal.node.title');

const project: Project = {
  id: stableId<'project'>('minimal.project'),
  key: 'MINI',
  name: 'Projet minimal',
  description: 'Fixture minimale du Runtime',
  author: 'fixtures',
  version: '0.1.0',
  locale: 'fr-FR',
  defaultThemeId: themeId,
  storageMode: 'local',
};

const theme: Theme = {
  id: themeId,
  name: 'Thème minimal',
  tokens: { 'space.1': '0.25rem', 'font.size.md': '1rem' },
  modes: {
    light: { 'color.surface': '#ffffff', 'color.text': '#1a1d23' },
    dark: { 'color.surface': '#12151b', 'color.text': '#e8eaee' },
  },
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
    [titleId]: { id: titleId, component: 'info.title@1', props: { text: 'Bonjour' }, children: [] },
  },
};

const pagesIndex: PagesIndex = {
  routes: [{ pageId, route: '/' }],
  initialPageId: pageId,
  menus: [],
};

/** A fresh copy on every call: callers may modify it freely. */
export function minimalFixture(): FixtureFiles {
  return structuredClone(
    buildPackage({
      project,
      entities: [],
      relations: [],
      roles: [],
      pages: [home],
      pagesIndex,
      queries: [],
      themes: [theme],
      workflows: [],
      components: ['info.title@1'],
    }),
  );
}
