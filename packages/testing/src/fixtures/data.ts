import type { Entity, Page, PagesIndex, Project, Relation, Theme } from '@acs/project-schema';
import { stableId } from '../ids.js';
import { buildPackage } from '../package-builder.js';
import type { FixtureFiles } from '../package-builder.js';

/**
 * A project of data: two linked entities (a customer and its purchases, one to many, `restrict`)
 * with fields of most types, unique keys, a choice list, a decimal and a reference. It is what the
 * data engine of lot 4 is shown on (AC-01, engine side). The records are not in the package (the
 * format of `testdata/` is the Studio's, lot 6): `dataTestData()` gives them, to load through the
 * API into the test data base. Reference fixture: change it only on purpose, never to make a test
 * pass; its digest is pinned.
 */
const themeId = stableId<'theme'>('data.theme');
const pageId = stableId<'page'>('data.page.home');
const titleId = stableId<'node'>('data.node.title');
const customerId = stableId<'entity'>('data.entity.customer');
const purchaseId = stableId<'entity'>('data.entity.purchase');

const project: Project = {
  id: stableId<'project'>('data.project'),
  key: 'DATA',
  name: 'Projet de données',
  description: 'Fixture du moteur de données',
  author: 'fixtures',
  version: '0.1.0',
  locale: 'fr-FR',
  defaultThemeId: themeId,
  storageMode: 'local',
};

const theme: Theme = {
  id: themeId,
  name: 'Thème des données',
  tokens: {},
  modes: { light: {}, dark: {} },
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
    [titleId]: { id: titleId, component: 'info.title@1', props: { text: 'Données' }, children: [] },
  },
};

const pagesIndex: PagesIndex = {
  routes: [{ pageId, route: '/' }],
  initialPageId: pageId,
  menus: [],
};

const customerField = (key: string) => stableId<'field'>(`data.customer.${key}`);
const purchaseField = (key: string) => stableId<'field'>(`data.purchase.${key}`);

const customer: Entity = {
  id: customerId,
  key: 'customer',
  label: 'Client',
  kind: 'business',
  classification: 'sensible',
  fields: [
    {
      id: customerField('name'),
      key: 'name',
      label: 'Nom',
      type: 'string',
      required: true,
      classification: 'sensible',
    },
    {
      id: customerField('email'),
      key: 'email',
      label: 'Courriel',
      type: 'string',
      required: true,
      unique: true,
      classification: 'sensible',
      options: { maxLength: 120, pattern: '^[^@\\s]+@[^@\\s]+$' },
    },
    {
      id: customerField('city'),
      key: 'city',
      label: 'Ville',
      type: 'string',
      required: false,
      classification: 'interne',
    },
    {
      id: customerField('vip'),
      key: 'vip',
      label: 'Client privilégié',
      type: 'boolean',
      required: false,
      default: false,
      classification: 'public',
    },
    {
      id: customerField('credit'),
      key: 'credit',
      label: 'Crédit',
      type: 'decimal',
      required: false,
      classification: 'interne',
      options: { precision: 10, scale: 2 },
    },
  ],
  indexes: [{ name: 'byCity', fields: ['city'] }],
};

const purchase: Entity = {
  id: purchaseId,
  key: 'purchase',
  label: 'Commande',
  kind: 'business',
  classification: 'interne',
  fields: [
    {
      id: purchaseField('number'),
      key: 'number',
      label: 'Numéro',
      type: 'string',
      required: true,
      unique: true,
      classification: 'public',
      options: { pattern: '^PO-\\d{4}$' },
    },
    {
      id: purchaseField('customer'),
      key: 'customer',
      label: 'Client',
      type: 'reference',
      required: true,
      classification: 'sensible',
      options: { target: customerId },
    },
    {
      id: purchaseField('total'),
      key: 'total',
      label: 'Total',
      type: 'decimal',
      required: true,
      classification: 'interne',
      options: { precision: 10, scale: 2 },
    },
    {
      id: purchaseField('status'),
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
            { value: 'paid', label: 'Payée' },
            { value: 'shipped', label: 'Expédiée' },
          ],
        },
      },
    },
    {
      id: purchaseField('orderedOn'),
      key: 'orderedOn',
      label: 'Commandée le',
      type: 'date',
      required: true,
      classification: 'public',
    },
    {
      id: purchaseField('shippedAt'),
      key: 'shippedAt',
      label: 'Expédiée à',
      type: 'datetime',
      required: false,
      classification: 'public',
    },
    {
      id: purchaseField('note'),
      key: 'note',
      label: 'Remarque',
      type: 'text',
      required: false,
      classification: 'interne',
    },
  ],
  indexes: [
    { name: 'byStatus', fields: ['status'] },
    { name: 'byOrderedOn', fields: ['orderedOn'] },
  ],
};

const relations: Relation[] = [
  {
    id: stableId<'relation'>('data.relation.purchases'),
    source: customerId,
    target: purchaseId,
    cardinality: '1-N',
    onDelete: 'restrict',
  },
];

/** A fresh copy on every call: callers may modify it freely. */
export function dataFixture(): FixtureFiles {
  return structuredClone(
    buildPackage({
      project,
      entities: [customer, purchase],
      relations,
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

/** Records by entity key, as the API takes them: with their identifiers, parents and children alike. */
export type FixtureTestData = Readonly<Record<string, readonly Record<string, unknown>[]>>;

const customerRow = (n: number) => stableId<'record'>(`data.testdata.customer.${String(n)}`);
const purchaseRow = (n: number) => stableId<'record'>(`data.testdata.purchase.${String(n)}`);

/**
 * The test data of the project: three customers and seven purchases. The amounts are chosen so that
 * a floating-point sum would be wrong (0.10 + 0.20) and so that two customers share a city. A fresh
 * copy on every call. The purchases come first on purpose: the loader must put the customers first.
 */
export function dataTestData(): FixtureTestData {
  const purchases = [
    [1, 1, 'PO-0001', '19.99', 'paid', '2026-09-01'],
    [2, 1, 'PO-0002', '5.01', 'shipped', '2026-09-03'],
    [3, 1, 'PO-0003', '100.00', 'draft', '2026-09-20'],
    [4, 2, 'PO-0004', '0.10', 'paid', '2026-09-21'],
    [5, 2, 'PO-0005', '0.20', 'paid', '2026-09-22'],
    [6, 3, 'PO-0006', '250.50', 'shipped', '2026-09-25'],
    [7, 3, 'PO-0007', '9.99', 'draft', '2026-09-30'],
  ] as const;
  return structuredClone({
    purchase: purchases.map(([n, owner, number, total, status, orderedOn]) => ({
      id: purchaseRow(n),
      number,
      customer: customerRow(owner),
      total,
      status,
      orderedOn,
      ...(status === 'shipped' ? { shippedAt: `${orderedOn}T14:30:00Z` } : {}),
    })),
    customer: [
      {
        id: customerRow(1),
        name: 'Ada Lovelace',
        email: 'ada@example.org',
        city: 'Paris',
        vip: true,
        credit: '1500.00',
      },
      {
        id: customerRow(2),
        name: 'Grace Hopper',
        email: 'grace@example.org',
        city: 'Lyon',
        credit: '0.10',
      },
      {
        id: customerRow(3),
        name: 'Linus Torvalds',
        email: 'linus@example.org',
        city: 'Paris',
        credit: '0.20',
      },
    ],
  });
}
