import { describe, expect, it } from 'vitest';
import { buildRouteTable } from './route-table.js';
import { routingIndex as indexOf, routingPage as page } from '@acs/testing';

const home = page('home', '/');
const orders = page('orders', '/orders');
const order = page('order', '/orders/:id', [{ name: 'id', type: 'integer' }]);

const issues = (index: ReturnType<typeof indexOf>, pages: Parameters<typeof indexOf>[0]) => {
  const result = buildRouteTable(index, pages);
  if (result.ok) return [];
  return (result.error.details as { issues: { file: string; path: string }[] }).issues.map(
    (i) => `${i.file} ${i.path}`,
  );
};

describe('buildRouteTable', () => {
  it('orders the routes from the most specific and finds the initial one', () => {
    const slug = page('slug', '/orders/:slug');
    const fixed = page('fixed', '/orders/new');
    const result = buildRouteTable(indexOf([home, order, slug, fixed], home), [
      home,
      order,
      slug,
      fixed,
    ]);
    expect(result.ok && result.value.routes.map((r) => r.path)).toEqual([
      '/',
      '/orders/new',
      '/orders/:id',
      '/orders/:slug',
    ]);
    expect(result.ok && result.value.initial.path).toBe('/');
  });

  it('gives a parameter the type its page declares, and string when it declares none', () => {
    const result = buildRouteTable(indexOf([home, order], home), [home, order]);
    const segment = result.ok
      ? result.value.routes.find((r) => r.path === '/orders/:id')?.segments[1]
      : null;
    expect(segment).toEqual({ kind: 'param', name: 'id', type: 'integer' });
    const undeclared = page('u', '/u/:name');
    const other = buildRouteTable(indexOf([home, undeclared], home), [home, undeclared]);
    expect(other.ok && other.value.routes.find((r) => r.path === '/u/:name')?.segments[1]).toEqual({
      kind: 'param',
      name: 'name',
      type: 'string',
    });
  });

  it('refuses a route that names no page', () => {
    const index = indexOf([home, orders], home);
    expect(issues(index, [home])).toEqual(['pages/index.json /routes/1/pageId']);
  });

  it('refuses a page that disagrees with the route of the index', () => {
    const index = {
      ...indexOf([home, orders], home),
      routes: [
        { pageId: home.id, route: '/' },
        { pageId: orders.id, route: '/commandes' },
      ],
    };
    expect(issues(index, [home, orders])).toEqual(['pages/index.json /routes/1/route']);
  });

  it('refuses two routes that the same URL can match', () => {
    const a = page('a', '/x/:id');
    const b = page('b', '/x/:other');
    expect(issues(indexOf([home, a, b], home), [home, a, b])).toEqual([
      'pages/index.json /routes/2/route',
    ]);
  });

  it('refuses a parameter the route does not have', () => {
    const lonely = page('lonely', '/lonely', [{ name: 'id', type: 'string' }]);
    expect(issues(indexOf([home, lonely], home), [home, lonely])).toEqual([
      `pages/${lonely.id}.json /params/0/name`,
    ]);
  });

  it('refuses an initial page that has no route or has parameters', () => {
    const noRoute = indexOf([home], home);
    expect(issues({ ...noRoute, initialPageId: orders.id }, [home, orders])).toEqual([
      'pages/index.json /initialPageId',
    ]);
    expect(issues(indexOf([home, order], order), [home, order])).toContain(
      'pages/index.json /initialPageId',
    );
  });

  it('requires the route / to belong to the initial page', () => {
    expect(issues(indexOf([home, orders], orders), [home, orders])).toEqual([
      'pages/index.json /routes/0/route',
    ]);
  });

  it('reports every problem at once', () => {
    const index = indexOf([home, orders], home);
    expect(issues({ ...index, initialPageId: order.id }, [])).toHaveLength(3);
  });
});
