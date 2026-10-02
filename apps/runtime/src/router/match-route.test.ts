import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pathFromHash, resolveLocation } from './match-route.js';
import { routingIndex, routingPage as page } from '@acs/testing';
import type { Page } from '@acs/project-schema';
import { buildRouteTable } from './route-table.js';

function tableOf(pages: readonly Page[], initial: Page) {
  const result = buildRouteTable(routingIndex(pages, initial), pages);
  if (!result.ok) throw new Error(JSON.stringify(result.error.details));
  return result.value;
}

const home = page('home', '/');
const orders = page('orders', '/orders');
const fresh = page('fresh', '/orders/new');
const order = page('order', '/orders/:id', [{ name: 'id', type: 'integer' }]);
const item = page('item', '/items/:ref/lines/:line', [
  { name: 'ref', type: 'uuid' },
  { name: 'line', type: 'integer' },
]);
const table = tableOf([home, orders, fresh, order, item], home);
const id = '01890a5d-ac96-774b-bcce-b302099a8057';

describe('pathFromHash', () => {
  it('drops the #, the query and a trailing slash, and roots an empty hash', () => {
    expect(pathFromHash('#/orders/42?tab=1')).toBe('/orders/42');
    expect(pathFromHash('#/orders/')).toBe('/orders');
    expect(pathFromHash('')).toBe('/');
    expect(pathFromHash('#')).toBe('/');
    expect(pathFromHash('#orders')).toBe('/orders');
  });
});

describe('resolveLocation', () => {
  it('opens a page with its typed parameters (deep link)', () => {
    expect(resolveLocation(table, '#/orders/42')).toMatchObject({
      kind: 'page',
      route: { path: '/orders/:id' },
      params: { id: 42 },
    });
    expect(resolveLocation(table, `#/items/${id}/lines/3`)).toMatchObject({
      kind: 'page',
      params: { ref: id, line: 3 },
    });
  });

  it('opens the literal route before a parameter route', () => {
    expect(resolveLocation(table, '#/orders/new')).toMatchObject({
      kind: 'page',
      route: { path: '/orders/new' },
    });
  });

  it('sends the root and an empty hash to the initial page when it has another route', () => {
    const start = page('start', '/start');
    const other = tableOf([start, orders], start);
    expect(resolveLocation(other, '')).toEqual({ kind: 'redirect', to: '/start' });
    expect(resolveLocation(other, '#/')).toEqual({ kind: 'redirect', to: '/start' });
    expect(resolveLocation(table, '#/')).toMatchObject({ kind: 'page', route: { path: '/' } });
    expect(resolveLocation(table, '')).toMatchObject({ kind: 'page', route: { path: '/' } });
  });

  it('refuses an invalid parameter and names it', () => {
    expect(resolveLocation(table, '#/orders/abc')).toMatchObject({
      kind: 'invalid-param',
      param: 'id',
    });
    expect(resolveLocation(table, `#/items/${id.toUpperCase()}/lines/3`)).toMatchObject({
      kind: 'invalid-param',
      param: 'ref',
    });
  });

  it('answers not-found for an unknown route, an extra segment or an empty segment', () => {
    for (const hash of ['#/nope', '#/orders/42/extra', '#/orders//42', '#/%E0%A4%A']) {
      expect(resolveLocation(table, hash).kind, hash).toBe('not-found');
    }
  });

  it('falls back to a valid parameter route when a more specific one is invalid', () => {
    const slug = page('slug', '/orders/:slug');
    const mixed = tableOf([home, order, slug], home);
    expect(resolveLocation(mixed, '#/orders/42')).toMatchObject({ route: { path: '/orders/:id' } });
    expect(resolveLocation(mixed, '#/orders/abc')).toMatchObject({
      kind: 'page',
      route: { path: '/orders/:slug' },
      params: { slug: 'abc' },
    });
  });

  it('decodes a parameter before typing it', () => {
    const named = page('named', '/n/:name', [{ name: 'name', type: 'string' }]);
    expect(resolveLocation(tableOf([home, named], home), '#/n/a%20b')).toMatchObject({
      params: { name: 'a b' },
    });
  });
});

describe('resolveLocation, for any literal segment', () => {
  const word = fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/);

  it('opens the literal route for its own name and the parameter route for any other', () => {
    fc.assert(
      fc.property(word, word, (literal, other) => {
        const fixed = page('fixed', `/a/${literal}`);
        const dynamic = page('dynamic', '/a/:p', [{ name: 'p', type: 'string' }]);
        const t = tableOf([home, dynamic, fixed], home);
        const own = resolveLocation(t, `#/a/${literal}`);
        const rest = resolveLocation(t, `#/a/${other}`);
        const ownOk = own.kind === 'page' && own.route.pageId === fixed.id;
        const restOk =
          rest.kind === 'page' && rest.route.pageId === (other === literal ? fixed.id : dynamic.id);
        return ownOk && restOk;
      }),
      { numRuns: 1000 },
    );
  });
});
