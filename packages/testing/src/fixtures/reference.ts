import type {
  Entity,
  Page,
  PagesIndex,
  Project,
  Query,
  Relation,
  Role,
  Theme,
} from '@acs/project-schema';
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * A small business application: customers and their orders, linked by a 1-N relation, with a
 * query, a role and two pages. It is the "project with two linked entities" the data engine
 * (lot 4) and the Studio designer (lot 6) work against. Reference fixture: change it only on
 * purpose, never to make a test pass.
 */
const themeId = stableId<'theme'>('reference.theme');
const customerId = stableId<'entity'>('reference.entity.customer');
const orderId = stableId<'entity'>('reference.entity.order');

const project: Project = {
  id: stableId<'project'>('reference.project'),
  key: 'CRM',
  name: 'Clients et commandes',
  description: 'Suivi des commandes par client',
  author: 'fixtures',
  version: '1.0.0',
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
      id: stableId<'field'>('reference.customer.name'),
      key: 'name',
      label: 'Nom',
      type: 'string',
      required: true,
      classification: 'interne',
      options: { maxLength: 120 },
    },
    {
      id: stableId<'field'>('reference.customer.email'),
      key: 'email',
      label: 'Courriel',
      type: 'string',
      required: false,
      unique: true,
      classification: 'sensible',
    },
    {
      id: stableId<'field'>('reference.customer.active'),
      key: 'active',
      label: 'Actif',
      type: 'boolean',
      required: false,
      default: true,
      classification: 'public',
    },
  ],
  indexes: [{ name: 'byName', fields: ['name'] }],
};

const order: Entity = {
  id: orderId,
  key: 'order',
  label: 'Commande',
  kind: 'business',
  classification: 'interne',
  fields: [
    {
      id: stableId<'field'>('reference.order.customer'),
      key: 'customer',
      label: 'Client',
      type: 'reference',
      required: true,
      classification: 'interne',
      options: { target: customerId },
    },
    {
      id: stableId<'field'>('reference.order.amount'),
      key: 'amount',
      label: 'Montant',
      type: 'decimal',
      required: true,
      default: '0.00',
      classification: 'interne',
      options: { precision: 12, scale: 2 },
    },
    {
      id: stableId<'field'>('reference.order.status'),
      key: 'status',
      label: 'Statut',
      type: 'choice',
      required: true,
      default: 'draft',
      classification: 'public',
      options: {
        source: {
          kind: 'list',
          values: [
            { value: 'draft', label: 'Brouillon' },
            { value: 'validated', label: 'Validée' },
            { value: 'cancelled', label: 'Annulée' },
          ],
        },
      },
    },
    {
      id: stableId<'field'>('reference.order.dueDate'),
      key: 'dueDate',
      label: 'Échéance',
      type: 'date',
      required: false,
      classification: 'public',
      validators: [
        { kind: 'expression', expr: 'value >= today()', message: "L'échéance doit être future" },
      ],
    },
    {
      id: stableId<'field'>('reference.order.note'),
      key: 'note',
      label: 'Note',
      type: 'text',
      required: false,
      classification: 'interne',
    },
  ],
  indexes: [
    { name: 'byCustomer', fields: ['customer'] },
    { name: 'byDueDate', fields: ['dueDate'] },
  ],
};

const relation: Relation = {
  id: stableId<'relation'>('reference.relation.customerOrders'),
  source: customerId,
  target: orderId,
  cardinality: '1-N',
  onDelete: 'restrict',
};

const openOrders: Query = {
  id: stableId<'query'>('reference.query.openOrders'),
  key: 'openOrders',
  source: 'order',
  filter: { and: [{ field: 'status', op: 'eq', value: 'validated' }] },
  sort: [{ field: 'dueDate', dir: 'asc' }],
  page: { size: 50 },
};

const editor: Role = {
  id: stableId<'role'>('reference.role.editor'),
  key: 'editor',
  label: 'Éditeur',
  permissions: {
    pages: ['home', 'orders'],
    actions: [],
    entities: [
      { entity: 'order', operations: ['read', 'create', 'update'] },
      { entity: 'customer', operations: ['read'] },
    ],
  },
};

const theme: Theme = {
  id: themeId,
  name: 'Thème de référence',
  tokens: { 'space.1': '0.25rem', 'space.2': '0.5rem', 'radius.md': '0.5rem' },
  modes: {
    light: { 'color.surface': '#ffffff', 'color.primary': '#1d4ed8' },
    dark: { 'color.surface': '#12151b', 'color.primary': '#7aa2ff' },
  },
  assets: {},
};

const homeId = stableId<'page'>('reference.page.home');
const homeTitle = stableId<'node'>('reference.node.home.title');
const ordersId = stableId<'page'>('reference.page.orders');
const ordersRoot = stableId<'node'>('reference.node.orders.root');
const ordersTitle = stableId<'node'>('reference.node.orders.title');
const ordersList = stableId<'node'>('reference.node.orders.list');

const home: Page = {
  id: homeId,
  key: 'home',
  route: '/',
  params: [],
  rootNodeId: homeTitle,
  guards: [],
  nodes: {
    [homeTitle]: {
      id: homeTitle,
      component: 'info.title@1',
      props: { text: 'Clients et commandes' },
      children: [],
    },
  },
};

const orders: Page = {
  id: ordersId,
  key: 'orders',
  route: '/orders',
  params: [],
  rootNodeId: ordersRoot,
  guards: [{ kind: 'role', role: 'editor' }],
  nodes: {
    [ordersRoot]: {
      id: ordersRoot,
      component: 'structure.page@1',
      props: {},
      children: [ordersTitle, ordersList],
    },
    [ordersTitle]: {
      id: ordersTitle,
      component: 'info.title@1',
      props: { text: 'Commandes validées' },
      children: [],
    },
    [ordersList]: {
      id: ordersList,
      component: 'data.list@1',
      props: { pageSize: 50 },
      responsive: { mobile: { pageSize: 10 } },
      bindings: { items: 'query.openOrders' },
      children: [],
    },
  },
};

const pagesIndex: PagesIndex = {
  routes: [
    { pageId: homeId, route: '/' },
    { pageId: ordersId, route: '/orders' },
  ],
  initialPageId: homeId,
  menus: [
    {
      key: 'main',
      label: 'Menu principal',
      items: [
        { label: 'Accueil', pageId: homeId },
        { label: 'Commandes', pageId: ordersId },
      ],
    },
  ],
};

/** A fresh copy on every call: callers may modify it freely. */
export function referenceFixture(): FixtureFiles {
  return structuredClone(
    buildPackage({
      project,
      entities: [customer, order],
      relations: [relation],
      roles: [editor],
      pages: [home, orders],
      pagesIndex,
      queries: [openOrders],
      themes: [theme],
      workflows: [],
      components: ['structure.page@1', 'info.title@1', 'data.list@1'],
    }),
  );
}
