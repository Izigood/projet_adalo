import type { Page, PagesIndex, Project, Theme, UINode } from '@acs/project-schema';
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * A page with the components that have behaviour: tabs (the last panel is a stack, which used to
 * lose its tab panel role), a menu of actions, a confirmation in a modal dialog, an accordion and a
 * notification. The interaction E2E suite plays them with the keyboard in the three browsers.
 * Reference fixture: change it only on purpose, never to make a test pass; its digest is pinned.
 */
const themeId = stableId<'theme'>('interactive.theme');
const pageId = stableId<'page'>('interactive.page.home');
const node = (name: string) => stableId<'node'>(`interactive.node.${name}`);

const project: Project = {
  id: stableId<'project'>('interactive.project'),
  key: 'INTER',
  name: 'Projet interactif',
  description: 'Fixture des composants interactifs',
  author: 'fixtures',
  version: '0.1.0',
  locale: 'fr-FR',
  defaultThemeId: themeId,
  storageMode: 'local',
};

const theme: Theme = {
  id: themeId,
  name: 'Thème par défaut',
  tokens: {},
  modes: { light: {}, dark: {} },
  assets: {},
};

const make = (
  name: string,
  component: string,
  props: Record<string, unknown>,
  children: string[] = [],
): UINode =>
  ({
    id: node(name),
    component: `${component}@1`,
    props,
    children: children.map(node),
  }) as UINode;

const nodes: UINode[] = [
  make('page', 'structure.page', { width: 'wide' }, ['stack']),
  make('stack', 'structure.stack', { gap: 'lg' }, [
    'title',
    'tabs',
    'menu',
    'confirmation',
    'accordion',
    'notification',
  ]),
  make('title', 'info.title', { text: 'Interactions', level: 1 }),
  make(
    'tabs',
    'structure.tabs',
    { label: 'Fiche', tabs: ['Résumé', 'Détail', 'Historique'], selected: 0 },
    ['tab-summary', 'tab-detail', 'tab-history'],
  ),
  make('tab-summary', 'info.text', { text: 'Contenu du résumé' }),
  make('tab-detail', 'info.text', { text: 'Contenu du détail' }),
  make('tab-history', 'structure.stack', { gap: 'sm' }, ['tab-history-text']),
  make('tab-history-text', 'info.text', { text: "Contenu de l'historique" }),
  make('menu', 'action.actionMenu', {
    label: 'Actions',
    items: [
      { key: 'edit', label: 'Modifier' },
      { key: 'copy', label: 'Dupliquer', disabled: true },
      { key: 'archive', label: 'Archiver' },
    ],
  }),
  make('confirmation', 'action.confirmation', {
    label: 'Supprimer',
    title: 'Supprimer la commande ?',
    message: 'Cette action est définitive.',
    tone: 'danger',
  }),
  make(
    'accordion',
    'structure.accordion',
    { label: 'Questions', items: ['Un', 'Deux', 'Trois'], open: [0], multiple: false },
    ['answer-one', 'answer-two', 'answer-three'],
  ),
  make('answer-one', 'info.text', { text: 'Réponse un' }),
  make('answer-two', 'info.text', { text: 'Réponse deux' }),
  make('answer-three', 'info.text', { text: 'Réponse trois' }),
  make('notification', 'action.notification', { message: 'Projet enregistré', tone: 'success' }),
];

const home: Page = {
  id: pageId,
  key: 'home',
  route: '/',
  params: [],
  rootNodeId: node('page'),
  guards: [],
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
};

const pagesIndex: PagesIndex = {
  routes: [{ pageId, route: '/' }],
  initialPageId: pageId,
  menus: [],
};

const COMPONENTS = [...new Set(nodes.map((n) => n.component))].sort();

/** A fresh copy on every call: callers may modify it freely. */
export function interactiveFixture(): FixtureFiles {
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
      components: COMPONENTS,
    }),
  );
}
