import { createRegistry } from '@acs/component-sdk';
import { BASE_DEFINITIONS } from '@acs/components';
import { err, ok } from '@acs/domain';
import type { IdentityProvider } from '@acs/domain';
import type { Page } from '@acs/project-schema';
import { CORRUPTED_FIXTURES, addPage as add, minimalFixture, stableId } from '@acs/testing';
import type { FixtureFiles, PageSpec } from '@acs/testing';
import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSource } from './boot/file-source.js';
import { createLocalIdentityProvider } from './identity/local-identity-provider.js';
import { mountRuntime } from './mount.js';
import type { MountOptions } from './mount.js';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';
import type { RuntimeRoot } from './runtime-root.js';

const memory =
  (files: FixtureFiles): FileSource =>
  (path) =>
    Promise.resolve(
      Object.hasOwn(files, path)
        ? ok(structuredClone(files[path]))
        : err('the server answered 404'),
    );

const addPage = (
  files: FixtureFiles,
  key: string,
  route: string,
  extra: Omit<PageSpec, 'key' | 'route'> = {},
): void => void add(files, { key, route, ...extra });

async function start(
  files: FixtureFiles,
  options: MountOptions = {},
  setup: (root: RuntimeRoot) => void = () => undefined,
): Promise<RuntimeRoot> {
  const root = mountRuntime(document.body, { source: memory(files), ...options });
  setup(root);
  await root.settled;
  await root.updateComplete;
  return root;
}

/**
 * What is on screen, shadow trees included: the components draw themselves in their own shadow
 * roots, so the text of a page is not in the one of the shell.
 */
function deepText(root: ParentNode | ShadowRoot): string {
  let text = '';
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (node instanceof Element) text += ` ${deepText(node.shadowRoot ?? node)} `;
  }
  return text;
}

/** The first element matching `selector`, looking through shadow roots. */
function deepFind(root: ParentNode, selector: string): Element | null {
  const found = root.querySelector(selector);
  if (found !== null) return found;
  for (const element of root.querySelectorAll('*')) {
    const inside = element.shadowRoot === null ? null : deepFind(element.shadowRoot, selector);
    if (inside !== null) return inside;
  }
  return null;
}

const shown = (root: RuntimeRoot) =>
  deepText(root.shadowRoot as ShadowRoot)
    .replace(/\s+/g, ' ')
    .trim();
const heading = (root: RuntimeRoot) =>
  deepFind(root.shadowRoot as ShadowRoot, 'h1')?.textContent?.trim();

async function go(root: RuntimeRoot, hash: string): Promise<void> {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await root.updateComplete;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.location.hash = '';
});
afterEach(() => {
  document.body.replaceChildren();
});

describe('mountRuntime', () => {
  it('attaches the application shell to the container', () => {
    const root = mountRuntime(document.body, { source: memory(minimalFixture()) });
    expect(root.localName).toBe(RUNTIME_ROOT_TAG);
    expect(document.body.contains(root)).toBe(true);
  });

  it('applies the base theme tokens at once, before any project is read', () => {
    mountRuntime(document.body, { source: () => new Promise(() => undefined) });
    const rules = document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(rules.join('\n')).toContain('--acs-color-surface');
  });
});

describe('the shell', () => {
  it('says it is loading until the project is read, then shows the initial page', async () => {
    const root = mountRuntime(document.body, { source: memory(minimalFixture()) });
    await root.updateComplete;
    expect(root.shadowRoot?.querySelector('[role="status"]')).not.toBeNull();
    await root.settled;
    await root.updateComplete;
    expect(heading(root)).toBe('Bonjour');
    expect(root.shadowRoot?.querySelector('[role="status"]')).toBeNull();
  });

  it('applies the theme of the project and names the document after it', async () => {
    const files = minimalFixture();
    const theme = files[Object.keys(files).find((p) => p.startsWith('themes/')) as string] as {
      modes: { light: Record<string, string> };
    };
    theme.modes.light['color.surface'] = '#abcdef';
    await start(files);
    const rules = document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(rules.join('\n')).toContain('#abcdef');
    expect(document.title).toBe('Projet minimal');
  });
});

describe('the shell, when the project cannot start', () => {
  it('names the reason and the file when a file is missing', async () => {
    const root = await start({});
    expect(root.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull();
    expect(shown(root)).toContain('MANIFEST_INVALID');
    expect(shown(root)).toContain('project.json');
  });

  it('shows the JSON path of a defect in the package', async () => {
    const fixture = CORRUPTED_FIXTURES.find((c) => c.name === 'project key in lower case (RG-11)');
    const root = await start(fixture?.build().files ?? {});
    expect(shown(root)).toContain('/project/key');
    expect(root.shadowRoot?.querySelector('h1')?.textContent).toContain('Impossible');
  });

  it('shows a reference instead of a blank page when starting breaks', async () => {
    const onFailure = vi.fn();
    const root = await start(
      {},
      {
        onFailure,
        source: () => {
          throw new Error('bug');
        },
      },
    );
    expect(root.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain('Référence');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('shows a reference instead of a dead shell when rendering itself breaks', async () => {
    const onFailure = vi.fn();
    const root = await start(minimalFixture(), { onFailure }, (r) => {
      Object.defineProperty(r, 'renderers', {
        get() {
          throw new Error('renderers lost');
        },
      });
    });
    const alert = root.shadowRoot?.querySelector('[role="alert"]');
    expect(alert?.querySelector('h1')?.textContent).toBe('Une erreur est survenue');
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ pageKey: '' }));
  });
});

describe('navigation (EF-NAV-01, EF-NAV-03)', () => {
  it('answers 404 for an address that matches no page, with a way back', async () => {
    const root = await start(minimalFixture());
    await go(root, '#/nope');
    expect(heading(root)).toBe('Page introuvable');
    expect(root.shadowRoot?.querySelector('a')?.getAttribute('href')).toBe('#/');
  });

  it('follows the hash: a page after another', async () => {
    const files = minimalFixture();
    addPage(files, 'orders', '/orders');
    const root = await start(files);
    expect(heading(root)).toBe('Bonjour');
    await go(root, '#/orders');
    expect(heading(root)).toBe('Page orders');
    await go(root, '#/');
    expect(heading(root)).toBe('Bonjour');
  });

  it('opens a deep link with its parameter, and refuses an invalid one by name', async () => {
    const files = minimalFixture();
    addPage(files, 'order', '/orders/:id', { params: [{ name: 'id', type: 'integer' }] });
    window.location.hash = '#/orders/42';
    const root = await start(files);
    expect(heading(root)).toBe('Page order');
    await go(root, '#/orders/abc');
    expect(heading(root)).toBe('Page introuvable');
    expect(shown(root)).toContain('id');
  });

  it('opens the initial page when the hash is empty, even when its route is not /', async () => {
    const files = minimalFixture();
    const indexPath = 'pages/index.json';
    const pagePath = Object.keys(files).find((p) =>
      /^pages\/[0-9a-f-]{36}\.json$/.test(p),
    ) as string;
    (files[pagePath] as Page & { route: string }).route = '/start';
    (files[indexPath] as { routes: { route: string }[] }).routes[0]!.route = '/start';
    const root = await start(files);
    expect(window.location.hash).toBe('#/start');
    expect(heading(root)).toBe('Bonjour');
  });

  it('stops following the hash once removed from the page', async () => {
    const files = minimalFixture();
    addPage(files, 'orders', '/orders');
    const root = await start(files);
    root.remove();
    await go(root, '#/orders');
    expect(heading(root)).toBe('Bonjour');
  });
});

describe('guards', () => {
  const guarded = (guards: Page['guards']) => {
    const files = minimalFixture();
    addPage(files, 'admin', '/admin', { guards });
    return files;
  };
  const withRoles = (roles: string[]): MountOptions => ({
    identity: (locale): IdentityProvider => createLocalIdentityProvider({ roles, locale }),
  });

  it('refuses a page whose role the user does not hold, and does not render its content', async () => {
    window.location.hash = '#/admin';
    const root = await start(guarded([{ kind: 'role', role: 'admin' }]));
    expect(heading(root)).toBe('Accès refusé');
    expect(shown(root)).not.toContain('Page admin');
  });

  it('opens it for a user who holds the role', async () => {
    window.location.hash = '#/admin';
    const root = await start(guarded([{ kind: 'role', role: 'admin' }]), withRoles(['admin']));
    expect(heading(root)).toBe('Page admin');
  });

  it('refuses a page with an expression guard, as the engine does not exist yet', async () => {
    window.location.hash = '#/admin';
    const root = await start(guarded([{ kind: 'expression', expr: 'true' }]), withRoles(['admin']));
    expect(heading(root)).toBe('Accès refusé');
    expect(shown(root)).toContain('condition');
  });

  it('leaves a page without guards open to a user with no role', async () => {
    const root = await start(minimalFixture());
    expect(heading(root)).toBe('Bonjour');
  });
});

describe('error boundaries', () => {
  it('contains a component that fails: the rest of the page stays and the failure is reported', async () => {
    const files = minimalFixture();
    addPage(files, 'broken', '/broken', { component: 'test.boom@1' });
    window.location.hash = '#/broken';
    const onFailure = vi.fn();
    const root = await start(files, {
      onFailure,
      renderers: {
        'info.title@1': (node) => html`<h1>${String(node.props['text'])}</h1>`,
        'test.boom@1': () => {
          throw new Error('boom');
        },
      },
    });
    expect(root.shadowRoot?.querySelector('.acs-node-error')).not.toBeNull();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'test.boom@1', pageKey: 'broken' }),
    );
    // The shell is alive: the user can leave the broken page.
    await go(root, '#/');
    expect(heading(root)).toBe('Bonjour');
  });

  it('draws what a renderer returns', async () => {
    const files = minimalFixture();
    addPage(files, 'custom', '/custom', { component: 'test.custom@1' });
    window.location.hash = '#/custom';
    const root = await start(files, {
      renderers: { 'test.custom@1': () => html`<p id="custom">sur mesure</p>` },
    });
    expect(root.shadowRoot?.querySelector('#custom')?.textContent).toBe('sur mesure');
  });
});

/** A `matchMedia` whose width the test controls; every query flips at the given minimum width. */
function fakeViewport(initialWidth: number) {
  type Listener = () => void;
  const queries: { min: number; listeners: Set<Listener> }[] = [];
  let width = initialWidth;
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    const entry = { min, listeners: new Set<Listener>() };
    queries.push(entry);
    return {
      get matches() {
        return width >= min;
      },
      addEventListener: (_type: string, listener: Listener) => entry.listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => entry.listeners.delete(listener),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return {
    resize(next: number) {
      width = next;
      for (const entry of queries) for (const listener of entry.listeners) listener();
    },
    listeners: () => queries.reduce((sum, entry) => sum + entry.listeners.size, 0),
    restore() {
      window.matchMedia = original;
    },
  };
}

/** The home page of the minimal package becomes a grid of two titles, 4 columns, 1 on mobile. */
function responsiveGrid(files: FixtureFiles): void {
  const path = Object.keys(files).find((p) => /^pages\/[0-9a-f-]{36}\.json$/.test(p)) as string;
  const page = files[path] as Page;
  const [titleId] = Object.keys(page.nodes);
  const grid = stableId<'node'>('shell.grid');
  const second = stableId<'node'>('shell.second');
  page.nodes[grid] = {
    id: grid,
    component: 'structure.grid@1',
    props: { columns: 4 },
    responsive: { mobile: { columns: 1 }, tablet: { columns: 2 } },
    children: [titleId as never, second],
  } as never;
  page.nodes[second] = {
    id: second,
    component: 'info.title@1',
    props: { text: 'Deuxième' },
    children: [],
  } as never;
  (page as { rootNodeId: string }).rootNodeId = grid;
}

describe('components, breakpoints and deprecation (lot 3)', () => {
  const gridColumns = (root: RuntimeRoot) =>
    deepFind(root.shadowRoot as ShadowRoot, 'acs-structure-grid')?.getAttribute('columns');

  it('draws the page with the real components of the library', async () => {
    const root = await start(minimalFixture());
    const title = deepFind(root.shadowRoot as ShadowRoot, 'acs-info-title');
    expect(title).not.toBeNull();
    expect(heading(root)).toBe('Bonjour');
  });

  it('follows the width of the window: the overrides of the breakpoint apply, live', async () => {
    const viewport = fakeViewport(1280);
    try {
      const files = minimalFixture();
      responsiveGrid(files);
      const root = await start(files);
      expect(gridColumns(root)).toBe('4');
      viewport.resize(768);
      await root.updateComplete;
      expect(gridColumns(root)).toBe('2');
      viewport.resize(360);
      await root.updateComplete;
      expect(gridColumns(root)).toBe('1');
      viewport.resize(1100);
      await root.updateComplete;
      expect(gridColumns(root)).toBe('4');
    } finally {
      viewport.restore();
    }
  });

  it('starts at the breakpoint of the window it opens in', async () => {
    const viewport = fakeViewport(360);
    try {
      const files = minimalFixture();
      responsiveGrid(files);
      expect(gridColumns(await start(files))).toBe('1');
    } finally {
      viewport.restore();
    }
  });

  it('stops listening to the window when it is removed', async () => {
    const viewport = fakeViewport(1280);
    try {
      const root = await start(minimalFixture());
      expect(viewport.listeners()).toBeGreaterThan(0);
      root.remove();
      expect(viewport.listeners()).toBe(0);
    } finally {
      viewport.restore();
    }
  });

  it('warns once, at start, about each deprecated component the project uses', async () => {
    const registry = createRegistry();
    for (const definition of BASE_DEFINITIONS) {
      const result = registry.register(
        definition.id === 'info.title'
          ? { ...definition, deprecated: { since: '1.1.0', replacement: 'info.title@2' } }
          : definition,
      );
      expect(result.ok).toBe(true);
    }
    const warnings: unknown[] = [];
    const files = minimalFixture();
    addPage(files, 'second', '/second');
    const root = await start(files, { registry, onWarning: (notice) => warnings.push(notice) });
    await go(root, '#/second');
    await go(root, '#/');
    expect(warnings).toEqual([
      { ref: 'info.title@1', since: '1.1.0', replacement: 'info.title@2' },
    ]);
  });

  it('warns about nothing when the project uses no deprecated component', async () => {
    const warnings: unknown[] = [];
    await start(minimalFixture(), { onWarning: (notice) => warnings.push(notice) });
    expect(warnings).toEqual([]);
  });

  it('shows a plugin component as unavailable and never asks for a plugin file', async () => {
    const files = minimalFixture();
    addPage(files, 'chart', '/chart', { component: 'acme.chart@1' });
    window.location.hash = '#/chart';
    const asked: string[] = [];
    const source: FileSource = (path) => {
      asked.push(path);
      return memory(files)(path);
    };
    const root = await start(files, { source });
    expect(deepFind(root.shadowRoot as ShadowRoot, '[role="note"]')?.textContent).toContain(
      'acme.chart@1',
    );
    expect(asked.every((path) => Object.hasOwn(files, path))).toBe(true);
    expect(asked.some((path) => /plugin/i.test(path))).toBe(false);
  });

  it('puts a marker, not a broken component, where the props are invalid', async () => {
    const files = minimalFixture();
    addPage(files, 'bad', '/bad');
    const pagePath = Object.keys(files).find((p) => (files[p] as Page).key === 'bad') as string;
    const bad = files[pagePath] as Page;
    (Object.values(bad.nodes)[0] as { props: object }).props = {};
    window.location.hash = '#/bad';
    const onFailure = vi.fn();
    const root = await start(files, { onFailure });
    expect(deepFind(root.shadowRoot as ShadowRoot, 'acs-info-title')).toBeNull();
    expect(root.shadowRoot?.querySelector('.acs-node-error')).not.toBeNull();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'info.title@1', pageKey: 'bad' }),
    );
  });
});
