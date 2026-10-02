import { err, ok } from '@acs/domain';
import type { IdentityProvider } from '@acs/domain';
import type { Page } from '@acs/project-schema';
import { CORRUPTED_FIXTURES, minimalFixture, stableId } from '@acs/testing';
import type { FixtureFiles } from '@acs/testing';
import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSource } from './boot/file-source.js';
import { createLocalIdentityProvider } from './identity/local-identity-provider.js';
import { mountRuntime } from './mount.js';
import type { MountOptions } from './mount.js';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';
import type { RuntimeRoot } from './runtime-root.js';
import { PROVISIONAL_RENDERERS } from './ui/render-page.js';

const memory =
  (files: FixtureFiles): FileSource =>
  (path) =>
    Promise.resolve(
      Object.hasOwn(files, path)
        ? ok(structuredClone(files[path]))
        : err('the server answered 404'),
    );

/** Adds a page to a package: one title node, its file and its route in the index. */
function addPage(
  files: FixtureFiles,
  key: string,
  route: string,
  extra: Partial<Pick<Page, 'params' | 'guards'>> & { component?: string } = {},
): void {
  const id = stableId<'page'>(`root.page.${key}`);
  const nodeId = stableId<'node'>(`root.node.${key}`);
  const page: Page = {
    id,
    key,
    route,
    params: extra.params ?? [],
    rootNodeId: nodeId,
    guards: extra.guards ?? [],
    nodes: {
      [nodeId]: {
        id: nodeId,
        component: extra.component ?? 'info.title@1',
        props: { text: `Page ${key}` },
        children: [],
      },
    },
  };
  files[`pages/${id}.json`] = page;
  (files['pages/index.json'] as { routes: unknown[] }).routes.push({ pageId: id, route });
}

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

const shown = (root: RuntimeRoot) =>
  root.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const heading = (root: RuntimeRoot) => root.shadowRoot?.querySelector('h1')?.textContent;

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
        ...PROVISIONAL_RENDERERS,
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
