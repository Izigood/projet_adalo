import { validateProps } from '@acs/component-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { safeHref } from './base/links.js';
import { BASE_DEFINITIONS, defineBaseElements } from './index.js';
import { mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());

const definition = (id: string) => {
  const found = BASE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no component ${id}`);
  return found;
};
const anchors = (element: Element) => [...(element.shadowRoot?.querySelectorAll('a') ?? [])];
const items = [
  { label: 'Accueil', href: '#/' },
  { label: 'Commandes', href: '#/orders' },
  { label: 'Aide', href: 'https://aide.example/' },
];

describe('safeHref', () => {
  it('lets through the destinations a manifest can name', () => {
    for (const href of [
      '#/',
      '#/orders/42',
      'https://example.com/a?b=1',
      'http://example.com',
      'mailto:a@example.com',
    ]) {
      expect(safeHref(href), href).toBe(href);
    }
  });

  it('refuses anything else, so the anchor stays inert', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      '/absolute/path',
      '//evil.example/x',
      'ftp://example.com',
      '#nope',
      'https://',
      'https://exa mple.com',
      '',
    ]) {
      expect(safeHref(href), href).toBeUndefined();
    }
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe('navigation.link', () => {
  it('is an anchor with the label as text and the destination as href', async () => {
    const link = await mount('acs-navigation-link', { label: 'Commandes', href: '#/orders' });
    const [anchor] = anchors(link);
    expect(anchor?.textContent).toBe('Commandes');
    expect(anchor?.getAttribute('href')).toBe('#/orders');
    expect(anchor?.hasAttribute('rel')).toBe(false);
  });

  it('does not let a page it opens reach back to the application (external links)', async () => {
    const link = await mount('acs-navigation-link', {
      label: 'Aide',
      href: 'https://aide.example/',
    });
    expect(anchors(link)[0]?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('has no destination at all for a script URL, even if the props were not validated', async () => {
    const link = await mount('acs-navigation-link', { label: 'x', href: 'javascript:alert(1)' });
    expect(anchors(link)[0]?.hasAttribute('href')).toBe(false);
  });

  it('shows its label as text, never as markup', async () => {
    const link = await mount('acs-navigation-link', {
      label: '<img src=x onerror=alert(1)>',
      href: '#/',
    });
    expect(link.shadowRoot?.querySelector('img')).toBeNull();
  });

  it('has props that the schema refuses when the destination is not allowed', () => {
    const link = definition('navigation.link');
    expect(validateProps(link, { label: 'x', href: 'javascript:alert(1)' }).ok).toBe(false);
    expect(validateProps(link, { label: 'x', href: '#/orders' }).ok).toBe(true);
  });
});

describe('navigation.backButton', () => {
  it('says "Retour" unless it is told otherwise, and shows its label', async () => {
    const button = await mount('acs-navigation-back-button', { label: 'Retour' });
    expect(button.shadowRoot?.querySelector('button')?.textContent?.trim()).toBe('Retour');
    const other = await mount('acs-navigation-back-button', { label: 'Revenir' });
    expect(other.shadowRoot?.querySelector('button')?.textContent?.trim()).toBe('Revenir');
  });

  it('asks to go back with acs-back, and does nothing else', async () => {
    const button = await mount('acs-navigation-back-button', { label: 'Retour' });
    const events: Event[] = [];
    button.addEventListener('acs-back', (event) => events.push(event));
    button.shadowRoot?.querySelector('button')?.click();
    expect(events).toHaveLength(1);
    expect(events[0]?.bubbles).toBe(true);
    expect(events[0]?.composed).toBe(true);
  });

  it('is a button that does not submit a form', async () => {
    const button = await mount('acs-navigation-back-button', { label: 'Retour' });
    expect(button.shadowRoot?.querySelector('button')?.getAttribute('type')).toBe('button');
  });
});

describe('navigation.menu', () => {
  it('is a navigation named by its label, with one link per item in a list', async () => {
    const menu = await mount('acs-navigation-menu', { label: 'Principal', items });
    expect(menu.shadowRoot?.querySelector('nav')?.getAttribute('aria-label')).toBe('Principal');
    expect(menu.shadowRoot?.querySelectorAll('ul > li')).toHaveLength(3);
    expect(anchors(menu).map((a) => a.getAttribute('href'))).toEqual([
      '#/',
      '#/orders',
      'https://aide.example/',
    ]);
  });

  it('marks the item the user is on, and only that one', async () => {
    const menu = await mount('acs-navigation-menu', {
      label: 'Principal',
      items,
      current: '#/orders',
    });
    expect(anchors(menu).map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null]);
  });

  it('marks nothing when no item is current', async () => {
    const menu = await mount('acs-navigation-menu', { label: 'Principal', items });
    expect(anchors(menu).every((a) => !a.hasAttribute('aria-current'))).toBe(true);
  });

  it('is vertical by default and horizontal on request', async () => {
    expect(
      (await mount('acs-navigation-menu', { label: 'P', items })).getAttribute('orientation'),
    ).toBe('vertical');
    expect(
      (
        await mount('acs-navigation-menu', { label: 'P', items, orientation: 'horizontal' })
      ).getAttribute('orientation'),
    ).toBe('horizontal');
  });

  it('leaves an item with a script URL without destination', async () => {
    const menu = await mount('acs-navigation-menu', {
      label: 'P',
      items: [{ label: 'x', href: 'javascript:alert(1)' }],
    });
    expect(anchors(menu)[0]?.hasAttribute('href')).toBe(false);
  });
});

describe('navigation.tabBar', () => {
  it('is a navigation named by its label with one link per item', async () => {
    const bar = await mount('acs-navigation-tab-bar', {
      label: 'Sections',
      items: items.slice(0, 2),
      current: '#/',
    });
    expect(bar.shadowRoot?.querySelector('nav')?.getAttribute('aria-label')).toBe('Sections');
    expect(anchors(bar).map((a) => a.textContent)).toEqual(['Accueil', 'Commandes']);
    expect(anchors(bar).map((a) => a.getAttribute('aria-current'))).toEqual(['page', null]);
  });

  it('accepts at most six items (the schema refuses more)', () => {
    const bar = definition('navigation.tabBar');
    const many = (count: number) => ({
      label: 'S',
      items: Array.from({ length: count }, (_, i) => ({ label: `L${i}`, href: '#/' })),
    });
    expect(validateProps(bar, many(6)).ok).toBe(true);
    expect(validateProps(bar, many(7)).ok).toBe(false);
  });
});

describe('navigation.breadcrumb', () => {
  const path = [
    { label: 'Accueil', href: '#/' },
    { label: 'Commandes', href: '#/orders' },
    { label: 'Commande 42' },
  ];

  it('is a navigation named by its label, with an ordered list', async () => {
    const crumb = await mount('acs-navigation-breadcrumb', { label: "Fil d'Ariane", items: path });
    expect(crumb.shadowRoot?.querySelector('nav')?.getAttribute('aria-label')).toBe("Fil d'Ariane");
    expect(
      [...(crumb.shadowRoot?.querySelectorAll('ol > li') ?? [])].map((li) =>
        li.textContent?.trim(),
      ),
    ).toEqual(['Accueil', 'Commandes', 'Commande 42']);
  });

  it('links the ancestors and shows the current page as plain text marked as current', async () => {
    const crumb = await mount('acs-navigation-breadcrumb', { label: 'x', items: path });
    expect(anchors(crumb).map((a) => a.getAttribute('href'))).toEqual(['#/', '#/orders']);
    const current = crumb.shadowRoot?.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe('Commande 42');
    expect(current?.localName).toBe('span');
  });

  it('never links the last item, even when it has a destination', async () => {
    const crumb = await mount('acs-navigation-breadcrumb', {
      label: 'x',
      items: [
        { label: 'A', href: '#/' },
        { label: 'B', href: '#/b' },
      ],
    });
    expect(anchors(crumb)).toHaveLength(1);
  });

  it('shows an ancestor without destination as text', async () => {
    const crumb = await mount('acs-navigation-breadcrumb', {
      label: 'x',
      items: [{ label: 'A' }, { label: 'B' }],
    });
    expect(anchors(crumb)).toHaveLength(0);
    expect(crumb.shadowRoot?.querySelectorAll('li')).toHaveLength(2);
  });

  it('shows its labels as text, never as markup', async () => {
    const crumb = await mount('acs-navigation-breadcrumb', {
      label: 'x',
      items: [{ label: '<b>x</b>' }],
    });
    expect(crumb.shadowRoot?.querySelector('b')).toBeNull();
  });
});
