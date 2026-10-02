import type { EntitiesFile, Page, PagesIndex, QueriesFile, RolesFile } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';
import { consistencyProblems, referenceFixture, stableId } from './index.js';
import type { FixtureFiles } from './index.js';

/** A tampered copy of the reference fixture and the problems the checker finds in it. */
function problemsAfter(tamper: (files: FixtureFiles) => void): string[] {
  const files = referenceFixture();
  tamper(files);
  return consistencyProblems(files);
}

const entities = (files: FixtureFiles) => files['schema/entities.json'] as EntitiesFile;
const roles = (files: FixtureFiles) => files['schema/roles.json'] as RolesFile;
const queries = (files: FixtureFiles) => files['queries/index.json'] as QueriesFile;
const index = (files: FixtureFiles) => files['pages/index.json'] as PagesIndex;
const ordersPage = (files: FixtureFiles) =>
  Object.values(files).find((file) => (file as Page).key === 'orders') as Page;

describe('consistencyProblems', () => {
  it('finds nothing in the untouched reference fixture', () => {
    expect(consistencyProblems(referenceFixture())).toEqual([]);
  });

  it('notices a file named by project.json that is missing', () => {
    expect(problemsAfter((files) => delete files['queries/index.json'])).toContain(
      'entries: queries/index.json is not in the package',
    );
  });

  it('notices an identifier used twice, and a default theme that does not exist', () => {
    expect(
      problemsAfter((files) => {
        const [customer, order] = entities(files).entities;
        if (customer && order) order.id = customer.id;
      }).some((problem) => problem.includes('is used twice')),
    ).toBe(true);
    expect(
      problemsAfter((files) => {
        (files['project.json'] as { project: { defaultThemeId: string } }).project.defaultThemeId =
          stableId('nowhere');
      }),
    ).toContain('project.defaultThemeId designates no theme of the package');
  });

  it('notices duplicate keys, bad indexes and dangling references in the data model', () => {
    expect(
      problemsAfter((files) => {
        const [customer, order] = entities(files).entities;
        if (customer && order) order.key = customer.key;
      }),
    ).toContain('two entities share a key');
    expect(
      problemsAfter((files) => {
        const order = entities(files).entities[1];
        if (order?.fields[1]) order.fields[1].key = 'customer';
      }),
    ).toContain('entity order: two fields share a key');
    expect(
      problemsAfter((files) => {
        entities(files).entities[1]?.indexes?.push({ name: 'bad', fields: ['nope'] });
      }),
    ).toContain('entity order: index bad uses unknown field nope');
    expect(
      problemsAfter((files) => {
        const field = entities(files).entities[1]?.fields[0];
        if (field?.type === 'reference') field.options.target = stableId('nowhere');
      }),
    ).toContain('entity order: field customer references an unknown entity');
    expect(
      problemsAfter((files) => {
        const relation = entities(files).relations[0];
        if (relation) relation.target = stableId('nowhere');
      }).some((problem) => problem.includes('links an unknown entity')),
    ).toBe(true);
  });

  it('notices a dictionary that does not exist', () => {
    expect(
      problemsAfter((files) => {
        const order = entities(files).entities[1];
        if (order) {
          order.fields.push({
            id: stableId('extra.field'),
            key: 'priority',
            label: 'Priorité',
            type: 'choice',
            required: false,
            classification: 'public',
            options: { source: { kind: 'dictionary', entity: stableId('nowhere') } },
          });
        }
      }),
    ).toContain('entity order: field priority uses an unknown dictionary');
  });

  it('notices queries and roles that name something unknown', () => {
    expect(
      problemsAfter((files) => {
        const query = queries(files).queries[0];
        if (query) query.source = 'invoice';
      }),
    ).toContain('query openOrders: unknown entity invoice');
    expect(
      problemsAfter((files) => {
        queries(files).queries[0]?.sort?.push({ field: 'nope', dir: 'asc' });
      }),
    ).toContain('query openOrders: unknown field nope');
    expect(
      problemsAfter((files) => roles(files).roles[0]?.permissions.pages.push('ghost')),
    ).toContain('role editor: unknown page ghost');
    expect(
      problemsAfter((files) =>
        roles(files).roles[0]?.permissions.entities.push({ entity: 'ghost', operations: ['read'] }),
      ),
    ).toContain('role editor: unknown entity ghost');
    expect(
      problemsAfter((files) =>
        roles(files).roles[0]?.permissions.entities.push({
          entity: 'order',
          operations: ['read'],
          fields: [{ field: 'ghost', access: 'hidden' }],
        }),
      ),
    ).toContain('role editor: unknown field ghost of order');
  });

  it('notices a pages index that points at pages that do not exist', () => {
    expect(problemsAfter((files) => (index(files).initialPageId = stableId('nowhere')))).toContain(
      'pages/index.json: unknown initial page',
    );
    expect(
      problemsAfter((files) =>
        index(files).routes.push({ pageId: stableId('nowhere'), route: '/x' }),
      ),
    ).toContain('pages/index.json: route /x has no page');
    expect(
      problemsAfter((files) =>
        index(files).menus[0]?.items.push({ label: 'Fantôme', pageId: stableId('nowhere') }),
      ),
    ).toContain('menu main: item Fantôme has no page');
  });

  it('notices broken page trees', () => {
    expect(
      problemsAfter((files) => (ordersPage(files).rootNodeId = stableId('nowhere'))),
    ).toContain('page orders: unknown root node');
    expect(
      problemsAfter((files) => {
        const page = ordersPage(files);
        const root = page.nodes[page.rootNodeId];
        if (root) page.nodes[stableId('moved')] = { ...root };
      }).some((problem) => problem.includes('node stored under')),
    ).toBe(true);
    expect(
      problemsAfter((files) => {
        const page = ordersPage(files);
        page.nodes[page.rootNodeId]?.children.push(stableId('nowhere'));
      }).some((problem) => problem.includes('has unknown child')),
    ).toBe(true);
    expect(
      problemsAfter((files) => {
        const page = ordersPage(files);
        const node = page.nodes[page.rootNodeId];
        if (node) node.component = 'data.chart@1';
      }),
    ).toContain('page orders: component data.chart@1 is not a declared dependency');
  });
});
