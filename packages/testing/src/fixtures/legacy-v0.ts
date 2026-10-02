import type { Entity, Page, PagesIndex, Project, Relation, Theme } from '@acs/project-schema';
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * The first manifest format (v0), as a prototype wrote it: one `project.json`, no
 * `manifestVersion`, free-text identifiers, legacy field types, a nested screen tree. The format
 * is described in `packages/project-schema/src/migrations/v0-to-v1.ts`.
 *
 * This is the "fixture of the old format" that every format change must keep (CLAUDE.md). It
 * stays a v0 package for ever: never bring it up to date, never edit it to make a test pass.
 */
export function legacyV0Fixture(): FixtureFiles {
  return structuredClone({
    'project.json': {
      project: {
        code: 'CRM',
        title: 'Clients et commandes',
        lang: 'fr-FR',
        version: '0.3.0',
        author: 'legacy',
        description: 'Prototype v0',
      },
      entities: [
        {
          id: 'e1',
          name: 'customer',
          title: 'Client',
          fields: [
            { id: 'f1', name: 'name', title: 'Nom', type: 'string', required: true },
            { id: 'f2', name: 'balance', title: 'Solde', type: 'number', decimals: 2 },
            { id: 'f3', name: 'vip', title: 'VIP', type: 'bool' },
          ],
        },
        {
          id: 'e2',
          name: 'order',
          title: 'Commande',
          fields: [
            { id: 'f4', name: 'customer', title: 'Client', type: 'link', to: 'e1', required: true },
            { id: 'f5', name: 'note', title: 'Note', type: 'longtext' },
            { id: 'f6', name: 'due', title: 'Échéance', type: 'date' },
            { id: 'f7', name: 'quantity', title: 'Quantité', type: 'number' },
          ],
        },
      ],
      relations: [{ id: 'r1', from: 'e1', to: 'e2', kind: 'one-to-many' }],
      screens: [
        {
          id: 's1',
          name: 'home',
          path: '/',
          tree: {
            component: 'page',
            children: [{ component: 'title', props: { text: 'Clients et commandes' } }],
          },
        },
        {
          id: 's2',
          name: 'orders',
          path: '/orders',
          tree: {
            component: 'page',
            children: [
              { component: 'title', props: { text: 'Commandes' } },
              { component: 'list', props: { pageSize: 25 } },
            ],
          },
        },
      ],
      theme: {
        name: 'Prototype',
        colors: { 'color.surface': '#ffffff', 'color.text': '#1a1d23' },
        dark: { 'color.surface': '#12151b' },
      },
    },
  });
}

/**
 * What migrating `legacyV0Fixture()` must give, written by hand and not computed by the
 * migration. Identifiers come from `stableId` with the hints the migration asks for
 * (`entity:e1`, `field:e1.f1`, `page:s1`, `node:s1/root`, `node:s1/0`...).
 */
export function legacyV0ExpectedV1(): FixtureFiles {
  const themeId = stableId<'theme'>('theme');
  const customerId = stableId<'entity'>('entity:e1');
  const orderId = stableId<'entity'>('entity:e2');
  const field = (legacy: string) => stableId<'field'>(`field:${legacy}`);

  const project: Project = {
    id: stableId<'project'>('project'),
    key: 'CRM',
    name: 'Clients et commandes',
    description: 'Prototype v0',
    author: 'legacy',
    version: '0.3.0',
    locale: 'fr-FR',
    defaultThemeId: themeId,
    storageMode: 'local',
  };

  const customer: Entity = {
    id: customerId,
    key: 'customer',
    label: 'Client',
    kind: 'business',
    classification: 'interne',
    fields: [
      {
        id: field('e1.f1'),
        key: 'name',
        label: 'Nom',
        type: 'string',
        required: true,
        classification: 'interne',
      },
      {
        id: field('e1.f2'),
        key: 'balance',
        label: 'Solde',
        type: 'decimal',
        required: false,
        classification: 'interne',
        options: { precision: 18, scale: 2 },
      },
      {
        id: field('e1.f3'),
        key: 'vip',
        label: 'VIP',
        type: 'boolean',
        required: false,
        classification: 'interne',
      },
    ],
  };
  const order: Entity = {
    id: orderId,
    key: 'order',
    label: 'Commande',
    kind: 'business',
    classification: 'interne',
    fields: [
      {
        id: field('e2.f4'),
        key: 'customer',
        label: 'Client',
        type: 'reference',
        required: true,
        classification: 'interne',
        options: { target: customerId },
      },
      {
        id: field('e2.f5'),
        key: 'note',
        label: 'Note',
        type: 'text',
        required: false,
        classification: 'interne',
      },
      {
        id: field('e2.f6'),
        key: 'due',
        label: 'Échéance',
        type: 'date',
        required: false,
        classification: 'interne',
      },
      {
        id: field('e2.f7'),
        key: 'quantity',
        label: 'Quantité',
        type: 'integer',
        required: false,
        classification: 'interne',
      },
    ],
  };
  const relation: Relation = {
    id: stableId<'relation'>('relation:r1'),
    source: customerId,
    target: orderId,
    cardinality: '1-N',
    onDelete: 'restrict',
  };

  const node = (path: string) => stableId<'node'>(`node:${path}`);
  const home: Page = {
    id: stableId<'page'>('page:s1'),
    key: 'home',
    route: '/',
    params: [],
    rootNodeId: node('s1/root'),
    guards: [],
    nodes: {
      [node('s1/root')]: {
        id: node('s1/root'),
        component: 'structure.page@1',
        props: {},
        children: [node('s1/0')],
      },
      [node('s1/0')]: {
        id: node('s1/0'),
        component: 'info.title@1',
        props: { text: 'Clients et commandes' },
        children: [],
      },
    },
  };
  const orders: Page = {
    id: stableId<'page'>('page:s2'),
    key: 'orders',
    route: '/orders',
    params: [],
    rootNodeId: node('s2/root'),
    guards: [],
    nodes: {
      [node('s2/root')]: {
        id: node('s2/root'),
        component: 'structure.page@1',
        props: {},
        children: [node('s2/0'), node('s2/1')],
      },
      [node('s2/0')]: {
        id: node('s2/0'),
        component: 'info.title@1',
        props: { text: 'Commandes' },
        children: [],
      },
      [node('s2/1')]: {
        id: node('s2/1'),
        component: 'data.list@1',
        props: { pageSize: 25 },
        children: [],
      },
    },
  };
  const pagesIndex: PagesIndex = {
    routes: [
      { pageId: home.id, route: '/' },
      { pageId: orders.id, route: '/orders' },
    ],
    initialPageId: home.id,
    menus: [],
  };
  const theme: Theme = {
    id: themeId,
    name: 'Prototype',
    tokens: {},
    modes: {
      light: { 'color.surface': '#ffffff', 'color.text': '#1a1d23' },
      dark: { 'color.surface': '#12151b' },
    },
    assets: {},
  };

  return structuredClone(
    buildPackage({
      project,
      entities: [customer, order],
      relations: [relation],
      roles: [],
      pages: [home, orders],
      pagesIndex,
      queries: [],
      themes: [theme],
      workflows: [],
      components: ['data.list@1', 'info.title@1', 'structure.page@1'],
    }),
  );
}
