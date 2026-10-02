// @vitest-environment happy-dom
import { html, render } from 'lit';
import type { Page, UINode } from '@acs/project-schema';
import { stableId } from '@acs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PROVISIONAL_RENDERERS, renderPage } from './render-page.js';
import type { NodeRenderers, RenderFailure } from './render-page.js';

const id = (name: string) => stableId<'node'>(`render.${name}`);
const node = (name: string, component: string, children: string[] = [], props = {}): UINode => ({
  id: id(name),
  component,
  props,
  children: children.map(id),
});
const pageOf = (root: string, nodes: UINode[]): Page => ({
  id: stableId<'page'>('render.page'),
  key: 'demo',
  route: '/',
  params: [],
  rootNodeId: id(root),
  guards: [],
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
});

const text = (name: string, value: string) => node(name, 'info.title@1', [], { text: value });
const box = (children: readonly unknown[]) => html`<section>${children}</section>`;
const RENDERERS: NodeRenderers = {
  ...PROVISIONAL_RENDERERS,
  'test.box@1': (_node, children) => box(children),
  'test.boom@1': () => {
    throw new Error('renderer failed');
  },
};

function show(page: Page, renderers: NodeRenderers = RENDERERS) {
  const failures: RenderFailure[] = [];
  const container = document.createElement('div');
  render(
    renderPage(page, renderers, (failure) => failures.push(failure)),
    container,
  );
  return { container, failures };
}

describe('renderPage', () => {
  it('renders the title of the provisional info.title@1 as text', () => {
    const { container, failures } = show(pageOf('a', [text('a', 'Bonjour')]));
    expect(container.querySelector('h1')?.textContent).toBe('Bonjour');
    expect(failures).toEqual([]);
  });

  it('never turns a prop into markup', () => {
    const { container } = show(pageOf('a', [text('a', '<img src=x onerror=alert(1)><b>x</b>')]));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('<img src=x onerror=alert(1)><b>x</b>');
  });

  it('renders children inside their parent, in order', () => {
    const page = pageOf('root', [
      node('root', 'test.box@1', ['a', 'b']),
      text('a', 'Premier'),
      text('b', 'Second'),
    ]);
    const titles = [...show(page).container.querySelectorAll('section > h1')];
    expect(titles.map((h) => h.textContent)).toEqual(['Premier', 'Second']);
  });

  it('shows a neutral marker for a component it does not know, and keeps its children', () => {
    const page = pageOf('root', [node('root', 'data.table@1', ['a']), text('a', 'Dedans')]);
    const { container, failures } = show(page);
    const marker = container.querySelector('[role="note"]');
    expect(marker?.textContent).toContain('data.table@1');
    expect(marker?.querySelector('h1')?.textContent).toBe('Dedans');
    expect(failures).toEqual([]);
  });

  it('contains a renderer that throws: the siblings stay, the failure is shown and reported', () => {
    const page = pageOf('root', [
      node('root', 'test.box@1', ['a', 'boom', 'b']),
      text('a', 'Avant'),
      node('boom', 'test.boom@1'),
      text('b', 'Après'),
    ]);
    const { container, failures } = show(page);
    expect([...container.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([
      'Avant',
      'Après',
    ]);
    const marker = container.querySelector('[role="alert"]');
    expect(marker).not.toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      pageKey: 'demo',
      nodeId: id('boom'),
      component: 'test.boom@1',
    });
    expect(marker?.getAttribute('data-correlation-id')).toBe(failures[0]?.correlationId);
    expect(marker?.textContent).toContain(failures[0]?.correlationId);
  });

  it('contains a failing root: the page is a marker, not an exception', () => {
    const { container, failures } = show(pageOf('boom', [node('boom', 'test.boom@1')]));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(failures).toHaveLength(1);
  });

  it('marks a child that does not exist and renders the others', () => {
    const page = pageOf('root', [node('root', 'test.box@1', ['gone', 'a']), text('a', 'Reste')]);
    const { container, failures } = show(page);
    expect(container.querySelector('h1')?.textContent).toBe('Reste');
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(failures[0]?.nodeId).toBe(id('gone'));
  });

  it('stops a cycle in the tree instead of recursing', () => {
    const page = pageOf('a', [node('a', 'test.box@1', ['b']), node('b', 'test.box@1', ['a'])]);
    const { container, failures } = show(page);
    expect(failures).toHaveLength(1);
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('stops a tree that is too deep', () => {
    const chain = Array.from({ length: 200 }, (_, i) =>
      node(`n${i}`, 'test.box@1', i < 199 ? [`n${i + 1}`] : []),
    );
    const { failures } = show(pageOf('n0', chain));
    expect(failures).toHaveLength(1);
    expect((failures[0]?.error as Error).message).toContain('too deep');
  });

  it('does not take a name of Object.prototype for a node or a component', () => {
    const page = pageOf('root', [node('root', 'constructor')]);
    const { container, failures } = show(page);
    expect(container.querySelector('[role="note"]')?.textContent).toContain('constructor');
    expect(failures).toEqual([]);
    const proto = pageOf('root', [node('root', 'test.box@1', ['__proto__'])]);
    expect(show(proto).failures).toHaveLength(1);
  });

  it('reports each failure with its own reference', () => {
    const report = vi.fn();
    const page = pageOf('root', [
      node('root', 'test.box@1', ['x', 'y']),
      node('x', 'test.boom@1'),
      node('y', 'test.boom@1'),
    ]);
    render(renderPage(page, RENDERERS, report), document.createElement('div'));
    const refs = report.mock.calls.map(([failure]) => (failure as RenderFailure).correlationId);
    expect(new Set(refs).size).toBe(2);
  });
});
