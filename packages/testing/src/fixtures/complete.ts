import { WORKFLOW_NODE_TYPES } from '@acs/project-schema';
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
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * A project that uses everything the manifest can express: the 13 field types, the three entity
 * kinds and classifications, a full query, a role with field rules, pages with parameters, guards
 * and responsive overrides, a workflow with the 22 node types, a themed brand and secret
 * references. Reference fixture: change it only on purpose, never to make a test pass.
 */
const themeId = stableId<'theme'>('complete.theme');
const catalogId = stableId<'entity'>('complete.entity.catalog');
const personId = stableId<'entity'>('complete.entity.person');
const ticketId = stableId<'entity'>('complete.entity.ticket');

const project: Project = {
  id: stableId<'project'>('complete.project'),
  key: 'TICKETS',
  name: 'Gestion des tickets',
  description: 'Fixture complète : tous les types de champ, de nœud et de garde.',
  author: 'fixtures',
  version: '1.2.0-rc.1+build.7',
  locale: 'fr-FR',
  defaultThemeId: themeId,
  storageMode: 'local',
};

const field = <Id extends string>(owner: string, key: Id) =>
  stableId<'field'>(`complete.${owner}.${key}`);

const catalog: Entity = {
  id: catalogId,
  key: 'catalog',
  label: 'Libellé de référence',
  kind: 'dictionary',
  classification: 'public',
  fields: [
    {
      id: field('catalog', 'code'),
      key: 'code',
      label: 'Code',
      type: 'string',
      required: true,
      unique: true,
      classification: 'public',
    },
    {
      id: field('catalog', 'label'),
      key: 'label',
      label: 'Libellé',
      type: 'string',
      required: true,
      classification: 'public',
    },
  ],
};

const person: Entity = {
  id: personId,
  key: 'person',
  label: 'Personne',
  kind: 'parameter',
  classification: 'sensible',
  fields: [
    {
      id: field('person', 'name'),
      key: 'name',
      label: 'Nom',
      type: 'string',
      required: true,
      classification: 'sensible',
    },
  ],
};

const ticket: Entity = {
  id: ticketId,
  key: 'ticket',
  label: 'Ticket',
  kind: 'business',
  classification: 'interne',
  fields: [
    {
      id: field('ticket', 'title'),
      key: 'title',
      label: 'Titre',
      type: 'string',
      required: true,
      classification: 'interne',
      options: { maxLength: 200, pattern: '^\\S.*$' },
    },
    {
      id: field('ticket', 'description'),
      key: 'description',
      label: 'Description',
      type: 'text',
      required: false,
      classification: 'interne',
      options: { maxLength: 10000 },
    },
    {
      id: field('ticket', 'priority'),
      key: 'priority',
      label: 'Priorité',
      type: 'integer',
      required: true,
      default: 3,
      classification: 'public',
      options: { min: 1, max: 5 },
    },
    {
      id: field('ticket', 'cost'),
      key: 'cost',
      label: 'Coût',
      type: 'decimal',
      required: false,
      classification: 'interne',
      options: { precision: 10, scale: 2 },
    },
    {
      id: field('ticket', 'urgent'),
      key: 'urgent',
      label: 'Urgent',
      type: 'boolean',
      required: false,
      default: false,
      classification: 'public',
      options: { nullable: true },
    },
    {
      id: field('ticket', 'openedOn'),
      key: 'openedOn',
      label: 'Ouvert le',
      type: 'date',
      required: true,
      classification: 'public',
      ui: { component: 'input.date@1', help: "Date d'ouverture", order: 1 },
    },
    {
      id: field('ticket', 'closedAt'),
      key: 'closedAt',
      label: 'Fermé à',
      type: 'datetime',
      required: false,
      classification: 'public',
    },
    {
      id: field('ticket', 'status'),
      key: 'status',
      label: 'Statut',
      type: 'choice',
      required: true,
      default: 'open',
      classification: 'public',
      options: {
        source: {
          kind: 'list',
          values: [
            { value: 'open', label: 'Ouvert' },
            { value: 'closed', label: 'Fermé' },
          ],
        },
      },
    },
    {
      id: field('ticket', 'labels'),
      key: 'labels',
      label: 'Étiquettes',
      type: 'multiChoice',
      required: false,
      classification: 'public',
      options: { source: { kind: 'dictionary', entity: catalogId }, min: 0, max: 5 },
    },
    {
      id: field('ticket', 'owner'),
      key: 'owner',
      label: 'Responsable',
      type: 'reference',
      required: false,
      classification: 'sensible',
      options: { target: personId },
    },
    {
      id: field('ticket', 'attachment'),
      key: 'attachment',
      label: 'Pièce jointe',
      type: 'file',
      required: false,
      classification: 'interne',
      options: { accept: ['application/pdf', '.docx'], maxSizeBytes: 5242880 },
    },
    {
      id: field('ticket', 'cover'),
      key: 'cover',
      label: 'Visuel',
      type: 'image',
      required: false,
      classification: 'public',
      options: { accept: ['image/png', 'image/jpeg'], maxSizeBytes: 1048576 },
    },
    {
      id: field('ticket', 'extra'),
      key: 'extra',
      label: 'Données libres',
      type: 'json',
      required: false,
      classification: 'interne',
      options: { schema: { type: 'object' } },
    },
  ],
  indexes: [
    { name: 'byStatus', fields: ['status'] },
    { name: 'byOwnerAndDate', fields: ['owner', 'openedOn'], unique: false },
  ],
};

const relations: Relation[] = [
  {
    id: stableId<'relation'>('complete.relation.owner'),
    source: personId,
    target: ticketId,
    cardinality: '1-N',
    onDelete: 'setNull',
  },
  {
    id: stableId<'relation'>('complete.relation.labels'),
    source: ticketId,
    target: catalogId,
    cardinality: 'N-N',
    onDelete: 'cascade',
  },
];

const urgentTickets: Query = {
  id: stableId<'query'>('complete.query.urgent'),
  key: 'urgentTickets',
  source: 'ticket',
  filter: {
    and: [
      { field: 'status', op: 'in', value: ['open'] },
      { field: 'priority', op: 'gte', value: 4 },
      { field: 'title', op: 'startsWith', value: 'URG' },
    ],
  },
  where: 'urgent == true',
  sort: [
    { field: 'priority', dir: 'desc' },
    { field: 'openedOn', dir: 'asc' },
  ],
  page: { size: 100, cursor: 'start' },
  projection: ['title', 'priority', 'status'],
  aggregate: [
    { fn: 'count', as: 'total' },
    { fn: 'avg', field: 'priority', as: 'averagePriority' },
  ],
};

const roles: Role[] = [
  {
    id: stableId<'role'>('complete.role.admin'),
    key: 'admin',
    label: 'Administrateur',
    permissions: {
      pages: ['dashboard', 'ticketDetail'],
      actions: ['export', 'purge'],
      entities: [
        {
          entity: 'ticket',
          operations: ['read', 'create', 'update', 'delete'],
          fields: [{ field: 'cost', access: 'editable' }],
        },
        { entity: 'person', operations: ['read', 'create', 'update', 'delete'] },
      ],
    },
  },
  {
    id: stableId<'role'>('complete.role.reader'),
    key: 'reader',
    label: 'Lecteur',
    permissions: {
      pages: ['dashboard'],
      actions: [],
      entities: [
        {
          entity: 'ticket',
          operations: ['read'],
          fields: [
            { field: 'cost', access: 'hidden' },
            { field: 'description', access: 'readonly' },
          ],
        },
      ],
    },
  },
];

const theme: Theme = {
  id: themeId,
  name: 'Charte Tickets',
  tokens: {
    'space.1': '0.25rem',
    'font.family.sans': "system-ui, 'Segoe UI', sans-serif",
    'radius.md': '0.5rem',
  },
  modes: {
    light: {
      'color.surface': '#ffffff',
      'color.primary': '#0b5fff',
      'shadow.sm': '0 1px 2px rgb(0 0 0 / 0.12)',
    },
    dark: { 'color.surface': '#101418', 'color.primary': '#8ab4ff' },
  },
  assets: { logo: `assets/${'a'.repeat(64)}.svg`, icon: `assets/${'b'.repeat(64)}.png` },
};

const secretRefs: SecretRef[] = [
  {
    id: stableId<'secretRef'>('complete.secret.smtp'),
    key: 'smtpPassword',
    description: 'Mot de passe du serveur de messagerie',
  },
  {
    id: stableId<'secretRef'>('complete.secret.api'),
    key: 'erpApiKey',
    description: "Clé de l'API de l'ERP",
  },
];

const dashboardId = stableId<'page'>('complete.page.dashboard');
const detailId = stableId<'page'>('complete.page.detail');
const node = (name: string) => stableId<'node'>(`complete.node.${name}`);

const dashboard: Page = {
  id: dashboardId,
  key: 'dashboard',
  route: '/',
  params: [],
  rootNodeId: node('dash.root'),
  guards: [],
  nodes: {
    [node('dash.root')]: {
      id: node('dash.root'),
      component: 'structure.page@1',
      props: {},
      children: [node('dash.title'), node('dash.tabs')],
      locked: true,
    },
    [node('dash.title')]: {
      id: node('dash.title'),
      component: 'info.title@1',
      props: { text: 'Tableau de bord', level: 1 },
      responsive: { mobile: { level: 2 }, tablet: { level: 2 }, desktop: { level: 1 } },
      children: [],
    },
    [node('dash.tabs')]: {
      id: node('dash.tabs'),
      component: 'structure.tabs@2',
      props: {},
      visibleWhen: "hasRole('admin') || hasRole('reader')",
      events: { change: [{ action: 'setState', key: 'tab' }] },
      children: [node('dash.list')],
    },
    [node('dash.list')]: {
      id: node('dash.list'),
      component: 'data.list@1',
      props: { pageSize: 25 },
      bindings: { items: 'query.urgentTickets' },
      events: { select: [{ action: 'navigate', to: '/tickets/:id' }] },
      children: [],
    },
  },
};

const detail: Page = {
  id: detailId,
  key: 'ticketDetail',
  route: '/tickets/:id',
  params: [{ name: 'id', type: 'uuid' }],
  rootNodeId: node('detail.root'),
  guards: [
    { kind: 'role', role: 'admin' },
    { kind: 'expression', expr: 'isOnline()' },
  ],
  nodes: {
    [node('detail.root')]: {
      id: node('detail.root'),
      component: 'structure.page@1',
      props: {},
      children: [node('detail.form')],
    },
    [node('detail.form')]: {
      id: node('detail.form'),
      component: 'data.form@1',
      props: { entity: 'ticket' },
      bindings: { record: 'route.params.id' },
      children: [],
    },
  },
};

const pagesIndex: PagesIndex = {
  routes: [
    { pageId: dashboardId, route: '/' },
    { pageId: detailId, route: '/tickets/:id' },
  ],
  initialPageId: dashboardId,
  menus: [
    {
      key: 'main',
      label: 'Navigation',
      items: [{ label: 'Tableau de bord', pageId: dashboardId }],
    },
  ],
};

const workflowNodeIds = new Map(
  WORKFLOW_NODE_TYPES.map((type) => [type, stableId<'workflowNode'>(`complete.wf.${type}`)]),
);
/** `start` first, `end` last, the other 20 types in the middle. */
const orderedTypes = [
  'start',
  ...WORKFLOW_NODE_TYPES.filter((t) => t !== 'start' && t !== 'end'),
  'end',
] as const;

const everyNode: Workflow = {
  id: stableId<'workflow'>('complete.workflow.everyNode'),
  key: 'everyNode',
  trigger: { kind: 'event', event: 'ticketCreated' },
  nodes: orderedTypes.map((type) => ({
    id: workflowNodeIds.get(type)!,
    type,
    label: type,
    params: {},
  })),
  edges: orderedTypes.slice(1).map((type, index) => ({
    id: stableId<'edge'>(`complete.wf.edge.${index}`),
    from: workflowNodeIds.get(orderedTypes[index]!)!,
    to: workflowNodeIds.get(type)!,
    ...(orderedTypes[index] === 'if' ? { branch: 'true' } : {}),
  })),
  variables: [
    { name: 'counter', type: 'number', default: 0 },
    { name: 'note', type: 'string' },
    { name: 'approved', type: 'boolean', default: false },
    { name: 'payload', type: 'json', default: { items: [] } },
  ],
  errorPolicy: { retries: 3, timeoutMs: 60000 },
  logLevel: 'debug',
};

const manual: Workflow = {
  id: stableId<'workflow'>('complete.workflow.manual'),
  key: 'closeTicket',
  trigger: { kind: 'manual' },
  nodes: [
    { id: stableId<'workflowNode'>('complete.manual.start'), type: 'start', params: {} },
    { id: stableId<'workflowNode'>('complete.manual.end'), type: 'end', params: {} },
  ],
  edges: [
    {
      id: stableId<'edge'>('complete.manual.edge'),
      from: stableId<'workflowNode'>('complete.manual.start'),
      to: stableId<'workflowNode'>('complete.manual.end'),
    },
  ],
  variables: [],
  errorPolicy: { retries: 0, timeoutMs: 1000 },
  logLevel: 'none',
};

/** A fresh copy on every call: callers may modify it freely. */
export function completeFixture(): FixtureFiles {
  return structuredClone(
    buildPackage({
      project,
      entities: [catalog, person, ticket],
      relations,
      roles,
      pages: [dashboard, detail],
      pagesIndex,
      queries: [urgentTickets],
      themes: [theme],
      workflows: [everyNode, manual],
      components: [
        'structure.page@1',
        'structure.tabs@2',
        'info.title@1',
        'data.list@1',
        'data.form@1',
      ],
      secretRefs,
    }),
  );
}
