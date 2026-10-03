import type { Page, PagesIndex, Project, Theme, UINode } from '@acs/project-schema';
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * A single page that uses one component of every family of the base library, laid out to change
 * with the window: a four-column grid that becomes two then one, a menu that is horizontal then
 * vertical. It is what the responsive E2E suite renders at 360, 768 and 1280 px (lot 3). Reference
 * fixture: change it only on purpose, never to make a test pass; its digest is pinned.
 */
const themeId = stableId<'theme'>('responsive.theme');
const pageId = stableId<'page'>('responsive.page.home');
const node = (name: string) => stableId<'node'>(`responsive.node.${name}`);

const project: Project = {
  id: stableId<'project'>('responsive.project'),
  key: 'RESP',
  name: 'Projet responsive',
  description: 'Fixture du rendu responsive',
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
  responsive?: UINode['responsive'],
): UINode =>
  ({
    id: node(name),
    component: `${component}@1`,
    props,
    ...(responsive === undefined ? {} : { responsive }),
    children: children.map(node),
  }) as UINode;

const indicators = ['orders', 'customers', 'revenue', 'delay'] as const;
const INDICATOR_PROPS: Record<(typeof indicators)[number], Record<string, unknown>> = {
  orders: { label: 'Commandes ouvertes', value: 42, hint: 'Cette semaine' },
  customers: { label: 'Nouveaux clients', value: 7, tone: 'success' },
  revenue: { label: "Chiffre d'affaires", value: '12 345 €', hint: 'Depuis lundi' },
  delay: { label: 'Retards', value: 3, tone: 'danger' },
};

const nodes: UINode[] = [
  make('page', 'structure.page', { width: 'wide' }, ['stack']),
  make('stack', 'structure.stack', { gap: 'md' }, [
    'title',
    'menu',
    'one-line',
    'two-lines',
    'grid',
    'progress',
    'alert',
    'button',
  ]),
  make('title', 'info.title', { text: 'Tableau de bord', level: 1 }),
  make(
    'menu',
    'navigation.menu',
    {
      label: 'Navigation principale',
      items: [
        { label: 'Accueil', href: '#/' },
        { label: 'Commandes', href: '#/orders' },
        { label: 'Clients', href: '#/customers' },
      ],
      current: '#/',
      orientation: 'horizontal',
    },
    [],
    { mobile: { orientation: 'vertical' } },
  ),
  make('one-line', 'info.text', { text: 'Une seule ligne.' }),
  make('two-lines', 'info.text', { text: 'Première ligne.\nSeconde ligne.' }),
  make(
    'grid',
    'structure.grid',
    { columns: 4, gap: 'md' },
    indicators.map((key) => `indicator-${key}`),
    {
      mobile: { columns: 1 },
      tablet: { columns: 2 },
    },
  ),
  ...indicators.map((key) => make(`indicator-${key}`, 'info.indicator', INDICATOR_PROPS[key])),
  make('progress', 'info.progress', { label: 'Import des données', value: 65 }),
  make('alert', 'info.alert', {
    message: 'La sauvegarde automatique est activée.',
    tone: 'success',
  }),
  make('button', 'action.button', { label: 'Enregistrer' }),
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

/** The components the page uses, as `family.name@major`. */
const COMPONENTS = [...new Set(nodes.map((n) => n.component))].sort();

/** A fresh copy on every call: callers may modify it freely. */
export function responsiveFixture(): FixtureFiles {
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
