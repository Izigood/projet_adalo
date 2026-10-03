// @vitest-environment happy-dom
import { createBaseRegistry, defineBaseElements } from '@acs/components';
import type { ComponentDefinition, ComponentRegistry } from '@acs/component-sdk';
import type { Page, UINode } from '@acs/project-schema';
import { stableId } from '@acs/testing';
import { render } from 'lit';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage } from './render-page.js';
import type { RenderFailure } from './render-page.js';
import { renderersFromRegistry } from './registry-renderers.js';

beforeAll(() => defineBaseElements());

const id = (name: string) => stableId<'node'>(`registry.${name}`);
const node = (
  name: string,
  component: string,
  props: Record<string, unknown> = {},
  children: string[] = [],
  responsive?: UINode['responsive'],
): UINode =>
  ({
    id: id(name),
    component,
    props,
    children: children.map(id),
    ...(responsive === undefined ? {} : { responsive }),
  }) as UINode;
const pageOf = (root: string, nodes: UINode[]): Page => ({
  id: stableId<'page'>('registry.page'),
  key: 'demo',
  route: '/',
  params: [],
  rootNodeId: id(root),
  guards: [],
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
});

function show(
  page: Page,
  breakpoint: 'mobile' | 'tablet' | 'desktop' = 'desktop',
  registry: ComponentRegistry = createBaseRegistry(),
  container: HTMLElement = document.createElement('div'),
) {
  const failures: RenderFailure[] = [];
  render(
    renderPage(page, renderersFromRegistry(registry, breakpoint), (failure) =>
      failures.push(failure),
    ),
    container,
  );
  return { container, failures };
}

type WithProps = HTMLElement & { props?: Record<string, unknown> };

describe('renderersFromRegistry', () => {
  it('draws a node as the element of its component, with its props and the defaults of the schema', () => {
    const { container, failures } = show(
      pageOf('t', [node('t', 'info.title@1', { text: 'Bonjour' })]),
    );
    const element = container.querySelector<WithProps>('acs-info-title');
    expect(element?.props).toEqual({ text: 'Bonjour', level: 1 });
    expect(failures).toEqual([]);
  });

  it('has a renderer for every component of the registry', () => {
    const registry = createBaseRegistry();
    const renderers = renderersFromRegistry(registry, 'desktop');
    expect(Object.keys(renderers).sort()).toEqual(
      registry
        .definitions()
        .map((definition) => `${definition.id}@1`)
        .sort(),
    );
  });

  it('puts the children inside the element, in order', () => {
    const page = pageOf('s', [
      node('s', 'structure.stack@1', {}, ['a', 'b']),
      node('a', 'info.title@1', { text: 'Premier' }),
      node('b', 'info.title@1', { text: 'Second' }),
    ]);
    const stack = show(page).container.querySelector('acs-structure-stack');
    expect(
      [...(stack?.children ?? [])].map((child) => (child as WithProps).props?.['text']),
    ).toEqual(['Premier', 'Second']);
  });

  describe('props by breakpoint (EF-UI-04)', () => {
    const grid = (responsive?: UINode['responsive']) =>
      pageOf('g', [node('g', 'structure.grid@1', { columns: 4 }, [], responsive)]);
    const columnsAt = (
      breakpoint: 'mobile' | 'tablet' | 'desktop',
      responsive?: UINode['responsive'],
    ) =>
      show(grid(responsive), breakpoint).container.querySelector<WithProps>('acs-structure-grid')
        ?.props?.['columns'];
    const overrides = { mobile: { columns: 1 }, tablet: { columns: 2 } };

    it('uses the overrides of the breakpoint the window is at', () => {
      expect(columnsAt('mobile', overrides)).toBe(1);
      expect(columnsAt('tablet', overrides)).toBe(2);
      expect(columnsAt('desktop', overrides)).toBe(4);
    });

    it('keeps the props when there is no override', () => {
      expect(columnsAt('mobile')).toBe(4);
    });

    it('ignores an override of a prop the component does not allow', () => {
      const page = pageOf('t', [
        node('t', 'info.title@1', { text: 'Vrai' }, [], {
          mobile: { text: 'Piraté' },
        } as UINode['responsive']),
      ]);
      const title = show(page, 'mobile').container.querySelector<WithProps>('acs-info-title');
      expect(title?.props?.['text']).toBe('Vrai');
    });

    it('checks the props after the override: an invalid override fails the node, not the page', () => {
      const page = pageOf('s', [
        node('s', 'structure.stack@1', {}, ['g']),
        node('g', 'structure.grid@1', { columns: 4 }, [], { mobile: { columns: 99 } }),
      ]);
      const { container, failures } = show(page, 'mobile');
      expect(container.querySelector('acs-structure-stack')).not.toBeNull();
      expect(failures).toHaveLength(1);
      expect(failures[0]?.component).toBe('structure.grid@1');
    });
  });

  it('turns invalid props into a marker on that node, and reports it', () => {
    const page = pageOf('s', [
      node('s', 'structure.stack@1', {}, ['a', 'bad']),
      node('a', 'info.title@1', { text: 'Reste' }),
      node('bad', 'info.title@1', {}),
    ]);
    const { container, failures } = show(page);
    expect(container.querySelector<WithProps>('acs-info-title')?.props?.['text']).toBe('Reste');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(failures).toHaveLength(1);
    expect(String((failures[0]?.error as Error).message)).toContain('/props/text');
  });

  it('refuses props the schema does not know, whatever they are called', () => {
    const page = pageOf('t', [node('t', 'info.title@1', { text: 'x', onclick: 'alert(1)' })]);
    const { container, failures } = show(page);
    expect(container.querySelector('acs-info-title')).toBeNull();
    expect(failures).toHaveLength(1);
  });

  it('shows a component the registry does not know as a neutral marker (a plugin is never loaded)', () => {
    const page = pageOf('p', [node('p', 'acme.chart@1', { anything: true })]);
    const { container, failures } = show(page);
    expect(container.querySelector('[role="note"]')?.textContent).toContain('acme.chart@1');
    expect(container.querySelector('acme-chart, script')).toBeNull();
    expect(failures).toEqual([]);
  });

  it('never puts an element name it does not trust into a template', () => {
    const bad = {
      id: 'info.bad',
      version: '1.0.0',
      tag: 'script src=x',
      propsSchema: { type: 'object', properties: {}, additionalProperties: false },
    } as unknown as ComponentDefinition;
    const registry = {
      definitions: () => [bad],
      resolve: () => bad,
      versionsOf: () => [bad],
      register: () => ({ ok: true as const, value: undefined }),
    } as unknown as ComponentRegistry;
    const { container, failures } = show(
      pageOf('b', [node('b', 'info.bad@1')]),
      'desktop',
      registry,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(String((failures[0]?.error as Error).message)).toContain('unsafe element name');
  });

  it('keeps the same element from one render to the next, so a component keeps its state', () => {
    const container = document.createElement('div');
    const first = show(
      pageOf('t', [node('t', 'info.title@1', { text: 'Un' })]),
      'desktop',
      createBaseRegistry(),
      container,
    );
    const element = first.container.querySelector<WithProps>('acs-info-title');
    show(
      pageOf('t', [node('t', 'info.title@1', { text: 'Deux' })]),
      'desktop',
      createBaseRegistry(),
      container,
    );
    const again = container.querySelector<WithProps>('acs-info-title');
    expect(again).toBe(element);
    expect(again?.props?.['text']).toBe('Deux');
  });
});
