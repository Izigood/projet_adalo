import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, PARAM_TYPES, validate } from './index.js';
import type { Issue, SchemaName } from './index.js';

const without = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

function issuesOf(name: SchemaName, document: unknown): string[] {
  const result = validate(name, document);
  if (result.ok) return [];
  return (result.error.details as { issues: Issue[] }).issues.map(
    (issue) => `${issue.keyword} ${issue.path}`,
  );
}

const node = (extra: Record<string, unknown> = {}) => ({
  id: newId<'node'>(),
  component: 'info.title@1',
  props: { text: 'Bonjour' },
  children: [],
  ...extra,
});

describe('UI node', () => {
  it('accepts a minimal node and a node that uses every attribute', () => {
    expect(issuesOf('UINode', node())).toEqual([]);
    const full = node({
      props: { text: 'Bonjour', level: 1 },
      responsive: { mobile: { level: 2 }, tablet: {}, desktop: { level: 1 } },
      bindings: { text: 'record.title' },
      events: { click: [{ action: 'navigate', to: '/home' }] },
      visibleWhen: "hasRole('editor')",
      children: [newId<'node'>(), newId<'node'>()],
      locked: true,
    });
    expect(issuesOf('UINode', full)).toEqual([]);
  });

  it('knows the three breakpoints of EF-UI-04 and no other', () => {
    expect([...BREAKPOINTS]).toEqual(['mobile', 'tablet', 'desktop']);
    expect(issuesOf('UINode', node({ responsive: { phone: {} } }))).toEqual([
      'additionalProperties /responsive/phone',
    ]);
    expect(issuesOf('UINode', node({ responsive: { mobile: 'small' } }))).toEqual([
      'type /responsive/mobile',
    ]);
  });

  it('designates children by identifier, never by label or key', () => {
    expect(issuesOf('UINode', node({ children: ['header', newId<'node'>(), 'footer'] }))).toEqual([
      'pattern /children/0',
      'pattern /children/2',
    ]);
  });

  it('points at a bad component reference, props, id or expression', () => {
    expect(issuesOf('UINode', node({ component: 'info.title' }))).toEqual(['pattern /component']);
    expect(issuesOf('UINode', node({ component: 'Info.title@1' }))).toEqual(['pattern /component']);
    expect(issuesOf('UINode', node({ props: 'text' }))).toEqual(['type /props']);
    expect(issuesOf('UINode', node({ props: [] }))).toEqual(['type /props']);
    expect(issuesOf('UINode', node({ id: 'root' }))).toEqual(['pattern /id']);
    expect(issuesOf('UINode', node({ visibleWhen: '' }))).toEqual(['minLength /visibleWhen']);
    expect(issuesOf('UINode', node({ locked: 'yes' }))).toEqual(['type /locked']);
  });

  it('requires id, component, props and children, and refuses other properties', () => {
    for (const name of ['id', 'component', 'props', 'children']) {
      expect(issuesOf('UINode', without(node(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('UINode', node({ script: 'alert(1)' }))).toEqual([
      'additionalProperties /script',
    ]);
  });
});

describe('page route', () => {
  const route = (value: string) => issuesOf('PageRoute', value);

  it('accepts the root, literal segments and :parameters', () => {
    for (const value of [
      '/',
      '/orders',
      '/orders/:id',
      '/a-b/c_d/:itemId',
      '/v2/items/:itemId/edit',
    ]) {
      expect(route(value), value).toEqual([]);
    }
  });

  it('refuses relative routes, trailing and double slashes, spaces, traversal and bad parameters', () => {
    const bad = [
      '',
      'orders',
      '/orders/',
      '//orders',
      '/ord ers',
      '/a/../b',
      '/:Id',
      '/:1id',
      '/orders/:',
      '/orders?x=1',
      '/orders#top',
      `/${'a'.repeat(200)}`,
    ];
    for (const value of bad) {
      expect(route(value), JSON.stringify(value)).not.toEqual([]);
    }
  });
});

describe('page', () => {
  const rootId = newId<'node'>();
  const page = (extra: Record<string, unknown> = {}) => ({
    id: newId<'page'>(),
    key: 'orderDetail',
    route: '/orders/:id',
    params: [{ name: 'id', type: 'uuid' }],
    rootNodeId: rootId,
    guards: [
      { kind: 'role', role: 'editor' },
      { kind: 'expression', expr: 'isOnline()' },
    ],
    nodes: { [rootId]: node({ id: rootId }) },
    ...extra,
  });

  it('accepts a page with parameters, guards and a node tree', () => {
    expect(issuesOf('Page', page())).toEqual([]);
    expect(issuesOf('Page', page({ params: [], guards: [], route: '/' }))).toEqual([]);
  });

  it('accepts the three parameter types and refuses others', () => {
    for (const type of PARAM_TYPES) {
      expect(issuesOf('Page', page({ params: [{ name: 'p', type }] }))).toEqual([]);
    }
    expect(issuesOf('Page', page({ params: [{ name: 'p', type: 'date' }] }))).toEqual([
      'enum /params/0/type',
    ]);
  });

  it('refuses a guard of an unknown kind, at the guard itself', () => {
    expect(issuesOf('Page', page({ guards: [{ kind: 'ip', allow: '10.0.0.0/8' }] }))).toEqual([
      'discriminator /guards/0',
    ]);
    expect(issuesOf('Page', page({ guards: [{ kind: 'role' }] }))).toEqual([
      'required /guards/0/role',
    ]);
  });

  it('reports a problem inside a node at the path of that node', () => {
    const badId = newId<'node'>();
    const document = page({
      nodes: { [rootId]: node({ id: rootId }), [badId]: node({ id: badId, component: 'oops' }) },
    });
    expect(issuesOf('Page', document)).toEqual([`pattern /nodes/${badId}/component`]);
  });

  it('accepts nodes only under an identifier key, and at least one node', () => {
    expect(issuesOf('Page', page({ nodes: { root: node() } }))).toEqual([
      'additionalProperties /nodes/root',
    ]);
    expect(issuesOf('Page', page({ nodes: {} }))).toEqual(['minProperties /nodes']);
  });

  it('points at a bad key, route or root node id and refuses a label for the root', () => {
    expect(issuesOf('Page', page({ key: 'Order' }))).toEqual(['pattern /key']);
    expect(issuesOf('Page', page({ route: 'orders' }))).toEqual(['pattern /route']);
    expect(issuesOf('Page', page({ rootNodeId: 'root' }))).toEqual(['pattern /rootNodeId']);
  });

  it('requires every attribute and refuses other properties', () => {
    for (const name of ['id', 'key', 'route', 'params', 'rootNodeId', 'guards', 'nodes']) {
      expect(issuesOf('Page', without(page(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('Page', page({ html: '<b>' }))).toEqual(['additionalProperties /html']);
  });
});

describe('pages index (pages/index.json)', () => {
  const pageId = newId<'page'>();
  const index = (extra: Record<string, unknown> = {}) => ({
    routes: [{ pageId, route: '/' }],
    initialPageId: pageId,
    menus: [{ key: 'main', label: 'Menu principal', items: [{ label: 'Accueil', pageId }] }],
    ...extra,
  });

  it('accepts routes, an initial page and menus', () => {
    expect(issuesOf('PagesIndex', index())).toEqual([]);
    expect(issuesOf('PagesIndex', index({ menus: [] }))).toEqual([]);
  });

  it('designates pages by id, and refuses a bad route or menu', () => {
    expect(issuesOf('PagesIndex', index({ initialPageId: 'home' }))).toEqual([
      'pattern /initialPageId',
    ]);
    expect(
      issuesOf('PagesIndex', index({ routes: [{ pageId: 'home', route: 'x' }] })).sort(),
    ).toEqual(['pattern /routes/0/pageId', 'pattern /routes/0/route'].sort());
    expect(
      issuesOf('PagesIndex', index({ menus: [{ key: 'Main', label: 'M', items: [] }] })),
    ).toEqual(['pattern /menus/0/key']);
    expect(
      issuesOf(
        'PagesIndex',
        index({ menus: [{ key: 'main', label: 'M', items: [{ label: 'A', pageId: 'home' }] }] }),
      ),
    ).toEqual(['pattern /menus/0/items/0/pageId']);
  });

  it('requires the three parts', () => {
    for (const name of ['routes', 'initialPageId', 'menus']) {
      expect(issuesOf('PagesIndex', without(index(), name))).toEqual([`required /${name}`]);
    }
  });
});
