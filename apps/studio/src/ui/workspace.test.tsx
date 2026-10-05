import { domainError } from '@acs/domain';
import type { Id } from '@acs/domain';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  browser,
  button,
  click,
  field,
  renderStudio,
  settle,
  unmountAll,
} from '../../test-kit/ui.js';
import { pageAdd, pageRemove, pageRename } from '../commands/page-commands.js';
import { t } from '../i18n.js';
import fr from '../locales/fr.json';
import { createStudioServices } from '../services.js';
import type { StudioServices } from '../services.js';
import { pageAddMessage } from './pages-nav.js';

afterEach(unmountAll);

async function open(key = 'DEMO', name = 'Demo') {
  const services = createStudioServices(browser());
  const made = await services.session.create({ key, name });
  if (!made.ok) throw new Error(made.error.message);
  const container = await renderStudio(services);
  return { services, container };
}

/** Adds pages through the bus, as the interface does, and returns their identifiers. */
async function addPages(services: StudioServices, keys: string[]): Promise<Id<'page'>[]> {
  const ids: Id<'page'>[] = [];
  await act(async () => {
    for (const key of keys) {
      const command = pageAdd({ key, route: `/${key}`, title: key });
      const result = services.bus.execute(command);
      if (!result.ok) throw new Error(result.error.message);
      ids.push(command.payload.pageId);
    }
  });
  return ids;
}

const nav = (container: HTMLElement) => container.querySelector('nav') as HTMLElement;
const keys = (container: HTMLElement) =>
  [...nav(container).querySelectorAll('.pages-select')].map((b) => b.textContent);
const current = (container: HTMLElement) =>
  nav(container).querySelector('.pages-select[aria-current="true"]')?.textContent;
const view = (container: HTMLElement) => container.querySelector('.page-view');
const panel = (container: HTMLElement) =>
  container.querySelector('section.zone-panel') as HTMLElement;
const history = (container: HTMLElement) =>
  [...panel(container).querySelectorAll('.history-list li')].map((li) => li.textContent);

describe('the pages of the open project (EF-UI-06, ARC-STU-01)', () => {
  it('lists them in order with their routes, marks the page of welcome and the one that is chosen', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders', 'clients']);
    await settle(() => expect(keys(container)).toEqual(['home', 'orders', 'clients']));
    expect(current(container)).toBe('home');
    const routes = [...nav(container).querySelectorAll('.pages-route')].map((r) => r.textContent);
    expect(routes).toEqual([t('pages.initial', { route: '/' }), '/orders', '/clients']);
    expect(nav(container).querySelector('h2')?.textContent).toBe(fr['pages.title']);
  });

  it('shows the page that is chosen in the work area: its key, its route and its title', async () => {
    const { container } = await open('DEMO', 'Mon appli');
    expect(view(container)?.querySelector('h2')?.textContent).toBe('home');
    expect(view(container)?.textContent).toContain(t('pages.routeLabel', { route: '/' }));
    expect(view(container)?.textContent).toContain(t('pages.titleLabel', { text: 'Mon appli' }));
    expect(view(container)?.getAttribute('aria-labelledby')).toBe(
      view(container)?.querySelector('h2')?.id,
    );
  });

  it('follows the choice of another page', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(keys(container)).toHaveLength(2));
    await click(button(container, 'orders'));
    expect(current(container)).toBe('orders');
    expect(view(container)?.querySelector('h2')?.textContent).toBe('orders');
    expect(view(container)?.textContent).toContain(t('pages.titleLabel', { text: 'orders' }));
    await click(button(container, 'home'));
    expect(current(container)).toBe('home');
  });
});

describe('adding a page', () => {
  it('adds it with the route that was typed, chooses it, and empties the form', async () => {
    const { container } = await open();
    field<HTMLInputElement>(container, fr['pages.key']).value = 'orders';
    field<HTMLInputElement>(container, fr['pages.route']).value = '/commandes';
    await click(button(container, fr['pages.add']));
    expect(keys(container)).toEqual(['home', 'orders']);
    expect(current(container)).toBe('orders');
    expect(view(container)?.textContent).toContain(t('pages.routeLabel', { route: '/commandes' }));
    expect(field<HTMLInputElement>(container, fr['pages.key']).value).toBe('');
    expect(history(container)).toEqual([fr['command.pageAdd']]);
  });

  it('takes /key for the route when none is typed', async () => {
    const { container } = await open();
    field<HTMLInputElement>(container, fr['pages.key']).value = '  orders ';
    await click(button(container, fr['pages.add']));
    expect(view(container)?.textContent).toContain(t('pages.routeLabel', { route: '/orders' }));
  });

  it.each([
    ['a key that is taken', 'home', '/autre', fr['pages.error.keyTaken']],
    ['a route that is taken', 'autre', '/', fr['pages.error.routeTaken']],
    ['no key', '   ', '/autre', fr['pages.error.keyRequired']],
  ])(
    'says so for %s, adds nothing, and keeps nothing in the history',
    async (_name, key, route, message) => {
      const { container } = await open();
      field<HTMLInputElement>(container, fr['pages.key']).value = key;
      field<HTMLInputElement>(container, fr['pages.route']).value = route;
      await click(button(container, fr['pages.add']));
      expect(nav(container).querySelector('[role="alert"]')?.textContent).toBe(message);
      expect(keys(container)).toEqual(['home']);
      expect(history(container)).toEqual([]);
      expect(field<HTMLInputElement>(container, fr['pages.key']).value).toBe(key);
    },
  );

  it.each([
    ['a key that is taken', 'home', '/autre', fr['pages.key'], fr['pages.error.keyTaken']],
    ['a route that is taken', 'autre', '/', fr['pages.route'], fr['pages.error.routeTaken']],
    ['no key', '', '/autre', fr['pages.key'], fr['pages.error.keyRequired']],
  ])(
    'marks the field that %s, links it to the message, and sends the focus there',
    async (_name, key, route, wrongField, message) => {
      const { container } = await open();
      field<HTMLInputElement>(container, fr['pages.key']).value = key;
      field<HTMLInputElement>(container, fr['pages.route']).value = route;
      await click(button(container, fr['pages.add']));
      const wrong = field<HTMLInputElement>(container, wrongField);
      const other = field<HTMLInputElement>(
        container,
        wrongField === fr['pages.key'] ? fr['pages.route'] : fr['pages.key'],
      );
      expect(wrong.getAttribute('aria-invalid')).toBe('true');
      expect(
        container.querySelector(`[id="${wrong.getAttribute('aria-describedby')}"]`)?.textContent,
      ).toBe(message);
      expect(other.getAttribute('aria-invalid')).toBe('false');
      expect(other.getAttribute('aria-describedby')).toBeNull();
      expect(document.activeElement).toBe(wrong);
    },
  );

  it('does not mark a field for a refusal that is not about one', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(keys(container)).toHaveLength(2));
    // The page of welcome cannot be removed, which no button of the list offers: ask the bus.
    const home = services.project.view.getState()?.initialPageId as Id<'page'>;
    await act(async () => void services.bus.execute(pageRemove({ pageId: home })));
    expect(nav(container).querySelector('[role="alert"]')).toBeNull();
    for (const label of [fr['pages.key'], fr['pages.route']]) {
      expect(field<HTMLInputElement>(container, label).getAttribute('aria-invalid')).toBe('false');
    }
  });

  it('stops saying it once a page is added', async () => {
    const { container } = await open();
    field<HTMLInputElement>(container, fr['pages.key']).value = 'home';
    await click(button(container, fr['pages.add']));
    expect(nav(container).querySelector('[role="alert"]')).not.toBeNull();
    field<HTMLInputElement>(container, fr['pages.key']).value = 'orders';
    await click(button(container, fr['pages.add']));
    expect(nav(container).querySelector('[role="alert"]')).toBeNull();
  });

  it('says what the error was in words', () => {
    const constraint = (field: string) =>
      domainError('CONSTRAINT_VIOLATION', 'x', { details: { field } });
    expect(pageAddMessage(constraint('key'))).toBe(fr['pages.error.keyTaken']);
    expect(pageAddMessage(constraint('route'))).toBe(fr['pages.error.routeTaken']);
    expect(pageAddMessage(constraint('pageId'))).toBe(fr['pages.error.generic']);
    expect(pageAddMessage(domainError('REFERENCE_BLOCKED', 'x'))).toBe(fr['pages.error.generic']);
  });
});

describe('moving and removing a page', () => {
  it('moves a page up or down, and a page at an end cannot go further', async () => {
    const { services, container } = await open();
    await addPages(services, ['a', 'b']);
    await settle(() => expect(keys(container)).toEqual(['home', 'a', 'b']));
    expect(button(container, 'Monter la page home').disabled).toBe(true);
    expect(button(container, 'Descendre la page b').disabled).toBe(true);

    await click(button(container, 'Monter la page b'));
    expect(keys(container)).toEqual(['home', 'b', 'a']);
    await click(button(container, 'Descendre la page home'));
    expect(keys(container)).toEqual(['b', 'home', 'a']);
    expect(services.project.view.getState()?.routes.map((r) => r.route)).toEqual(['/b', '/', '/a']);
    expect(history(container).slice(0, 2)).toEqual([
      fr['command.pageMove'],
      fr['command.pageMove'],
    ]);
  });

  it('removes a page, but not the one of welcome, and the page chosen falls back to it', async () => {
    const { services, container } = await open();
    await addPages(services, ['a']);
    await settle(() => expect(keys(container)).toEqual(['home', 'a']));
    expect(button(container, 'Supprimer la page home').disabled).toBe(true);

    await click(button(container, 'a'));
    expect(current(container)).toBe('a');
    await click(button(container, 'Supprimer la page a'));
    expect(keys(container)).toEqual(['home']);
    expect(current(container)).toBe('home');
    expect(view(container)?.querySelector('h2')?.textContent).toBe('home');
    expect(services.project.view.getState()?.pages.order).toHaveLength(1);
  });

  it('undoes a removal, and the page is back where it was', async () => {
    const { services, container } = await open();
    await addPages(services, ['a', 'b']);
    await settle(() => expect(keys(container)).toHaveLength(3));
    await click(button(container, 'Supprimer la page a'));
    expect(keys(container)).toEqual(['home', 'b']);
    await click(button(container, fr['history.undo']));
    expect(keys(container)).toEqual(['home', 'a', 'b']);
  });

  it('names the page in what a screen reader says, and keeps the short word on the button', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(keys(container)).toHaveLength(2));
    const item = [...nav(container).querySelectorAll('.pages-item')][1] as HTMLElement;
    const buttons = [...item.querySelectorAll('.pages-actions button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Monter', 'Descendre', 'Supprimer']);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Monter la page orders',
      'Descendre la page orders',
      'Supprimer la page orders',
    ]);
  });

  it('does not keep the choice of a page in another project', async () => {
    const { services, container } = await open('AA', 'Premier');
    await addPages(services, ['orders']);
    await settle(() => expect(keys(container)).toHaveLength(2));
    await click(button(container, 'orders'));
    expect(current(container)).toBe('orders');
    await settle(() => undefined);
    const second = await act(async () => services.session.create({ key: 'BB', name: 'Second' }));
    expect(second.ok).toBe(true);
    await settle(() =>
      expect(container.querySelector('.project-name')?.textContent).toBe('Second'),
    );
    expect(keys(container)).toEqual(['home']);
    expect(current(container)).toBe('home');
  });
});

describe('the panel under the work area', () => {
  it('says there is nothing to undo, and nothing is shown while no project is open', async () => {
    const closed = await renderStudio(createStudioServices(browser()));
    // The catalogue that is shown reads its list: wait for it, so that nothing lands after the test.
    await settle(() => expect(closed.querySelector('.catalog-empty')).not.toBeNull());
    expect(panel(closed).textContent).toBe('');
    const { container } = await open();
    expect(panel(container).querySelector('h2')?.textContent).toBe(fr['panel.history']);
    expect(panel(container).textContent).toContain(fr['panel.historyEmpty']);
  });

  it('lists the commands that can be undone, the latest first, and drops one when it is undone', async () => {
    const { services, container } = await open();
    const [first] = await addPages(services, ['a']);
    await act(
      async () => void services.bus.execute(pageRename({ pageId: first as Id<'page'>, key: 'b' })),
    );
    await settle(() => expect(history(container)).toHaveLength(2));
    expect(history(container)).toEqual([fr['command.pageRename'], fr['command.pageAdd']]);
    await click(button(container, fr['history.undo']));
    expect(history(container)).toEqual([fr['command.pageAdd']]);
  });

  it('shows the 20 latest commands and says how many older ones there are', async () => {
    const { services, container } = await open();
    await addPages(
      services,
      Array.from({ length: 25 }, (_, i) => `p${i}`),
    );
    await settle(() => expect(history(container)).toHaveLength(20));
    expect(panel(container).textContent).toContain(t('panel.historyOlder', { count: 5 }));
  });

  it('says that the project is valid', async () => {
    const { container } = await open();
    expect(panel(container).textContent).toContain(fr['panel.valid']);
    expect(panel(container).querySelector('.problems-list')).toBeNull();
  });

  it('says what keeps the project from being saved, where it is, and stops saying it when undone', async () => {
    const { services, container } = await open();
    const [orders] = await addPages(services, ['orders']);
    await act(
      async () =>
        void services.bus.execute(pageRename({ pageId: orders as Id<'page'>, key: 'Not A Key' })),
    );
    await settle(() => expect(panel(container).textContent).toContain(fr['panel.problems.one']));
    const items = [...panel(container).querySelectorAll('.problems-list li')].map(
      (li) => li.textContent,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toContain(`pages/${orders}.json`);
    expect(items[0]).toContain('/key');
    expect(panel(container).textContent).not.toContain(fr['panel.valid']);

    await click(button(container, fr['history.undo']));
    expect(panel(container).textContent).toContain(fr['panel.valid']);
    expect(panel(container).querySelector('.problems-list')).toBeNull();
  });

  it('counts the problems, lists the first 20 and says how many more there are', async () => {
    const { services, container } = await open();
    await addPages(
      services,
      Array.from({ length: 22 }, (_, i) => `Bad${i}`),
    );
    await settle(() =>
      expect(panel(container).textContent).toContain(t('panel.problems.other', { count: 22 })),
    );
    expect(panel(container).querySelectorAll('.problems-list li')).toHaveLength(20);
    expect(panel(container).textContent).toContain(t('panel.problemsMore', { count: 2 }));
  });
});
