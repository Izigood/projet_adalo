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
  typeInto,
  unmountAll,
} from '../../test-kit/ui.js';
import { pageAdd } from '../commands/page-commands.js';
import fr from '../locales/fr.json';
import { createStudioServices } from '../services.js';
import type { StudioServices } from '../services.js';

afterEach(unmountAll);

type Field = HTMLInputElement | HTMLTextAreaElement;

async function open(key = 'DEMO', name = 'Demo') {
  const services = createStudioServices(browser());
  const made = await services.session.create({ key, name });
  if (!made.ok) throw new Error(made.error.message);
  const container = await renderStudio(services);
  return { services, container };
}

async function addPages(services: StudioServices, keys: string[]): Promise<Id<'page'>[]> {
  const ids: Id<'page'>[] = [];
  await act(async () => {
    for (const key of keys) {
      const command = pageAdd({ key, route: `/${key}`, title: key });
      services.bus.execute(command);
      ids.push(command.payload.pageId);
    }
  });
  return ids;
}

/** Types into the field the label names, then leaves it, as a person who changes a value does. */
async function edit(container: HTMLElement, label: string, value: string) {
  const target = field<Field>(container, label);
  await act(async () => target.focus());
  await typeInto(target, value);
  await act(async () => target.blur());
}

function press(target: Element, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => void target.dispatchEvent(event));
  return event;
}

const aside = (container: HTMLElement) => container.querySelector('aside') as HTMLElement;
const history = (container: HTMLElement) =>
  [...container.querySelectorAll('.history-list li')].map((li) => li.textContent);
const value = (container: HTMLElement, label: string) => field<Field>(container, label).value;
const pagesOf = (container: HTMLElement) =>
  [...container.querySelectorAll('nav .pages-select')].map((b) => b.textContent);

describe('the inspector shows the project and the page that is chosen (ARC-STU-01)', () => {
  it('is empty while no project is open', async () => {
    const container = await renderStudio(createStudioServices(browser()));
    expect(aside(container).textContent).toBe('');
  });

  it('gives every field of the project, with its value, and the key that cannot be changed', async () => {
    const services = createStudioServices(browser());
    const made = await services.session.create({
      key: 'DEMO',
      name: 'Mon appli',
      description: 'Un essai',
      author: 'Ada',
    });
    if (!made.ok) throw new Error(made.error.message);
    const container = await renderStudio(services);
    expect(aside(container).querySelector('h2')?.textContent).toBe(fr['inspector.project']);
    expect(aside(container).textContent).toContain('Clé : DEMO (non modifiable)');
    expect(value(container, fr['inspector.name'])).toBe('Mon appli');
    expect(value(container, fr['inspector.description'])).toBe('Un essai');
    expect(value(container, fr['inspector.author'])).toBe('Ada');
    expect(value(container, fr['inspector.version'])).toBe('0.1.0');
    expect(value(container, fr['inspector.locale'])).toBe('fr-FR');
    expect(field(container, fr['inspector.description']).tagName).toBe('TEXTAREA');
  });

  it('limits what can be typed to what the schemas accept', async () => {
    const { container } = await open();
    const limits = [
      [fr['inspector.name'], 200],
      [fr['inspector.description'], 2000],
      [fr['inspector.author'], 200],
      [fr['inspector.version'], 64],
      [fr['inspector.locale'], 8],
      [fr['inspector.pageKey'], 64],
      [fr['inspector.pageRoute'], 200],
    ] as const;
    for (const [label, max] of limits) expect(field<Field>(container, label).maxLength).toBe(max);
  });

  it('gives the key and the route of the page that is chosen, and follows the choice', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(pagesOf(container)).toHaveLength(2));
    expect(aside(container).querySelectorAll('h2')[1]?.textContent).toBe(fr['inspector.page']);
    expect(value(container, fr['inspector.pageKey'])).toBe('home');
    expect(value(container, fr['inspector.pageRoute'])).toBe('/');
    await click(button(container, 'orders'));
    expect(value(container, fr['inspector.pageKey'])).toBe('orders');
    expect(value(container, fr['inspector.pageRoute'])).toBe('/orders');
  });
});

describe('changing a value of the project', () => {
  it('changes it when the field is left, in one command, and shows it where the name is', async () => {
    const { container } = await open();
    await edit(container, fr['inspector.name'], 'Renommé');
    expect(container.querySelector('.project-name')?.textContent).toBe('Renommé');
    expect(history(container)).toEqual([fr['command.projectUpdate']]);
  });

  it('changes only that field of the project', async () => {
    const { services, container } = await open('DEMO', 'Mon appli');
    await edit(container, fr['inspector.version'], '0.2.0');
    expect(services.project.view.getState()?.project).toMatchObject({
      name: 'Mon appli',
      version: '0.2.0',
      locale: 'fr-FR',
      key: 'DEMO',
    });
  });

  it('does nothing when the value is the one that is there, and takes away the spaces around it', async () => {
    const { container } = await open();
    await edit(container, fr['inspector.name'], '  Demo  ');
    expect(history(container)).toEqual([]);
    expect(value(container, fr['inspector.name'])).toBe('Demo');
    await edit(container, fr['inspector.author'], '  Ada ');
    expect(value(container, fr['inspector.author'])).toBe('Ada');
    expect(history(container)).toHaveLength(1);
  });

  it('changes it on Enter, and keeps the focus where it was', async () => {
    const { container } = await open();
    const name = field<Field>(container, fr['inspector.name']);
    await act(async () => name.focus());
    await typeInto(name, 'Par Entrée');
    expect(press(name, 'Enter').defaultPrevented).toBe(true);
    expect(container.querySelector('.project-name')?.textContent).toBe('Par Entrée');
    expect(document.activeElement).toBe(name);
  });

  it('leaves Enter to the description, where it is a new line', async () => {
    const { container } = await open();
    const description = field<Field>(container, fr['inspector.description']);
    await act(async () => description.focus());
    await typeInto(description, 'Ligne un');
    expect(press(description, 'Enter').defaultPrevented).toBe(false);
    expect(history(container)).toEqual([]);
    await act(async () => description.blur());
    expect(history(container)).toHaveLength(1);
  });

  it('gives the value back on Escape, without a command', async () => {
    const { container } = await open();
    const name = field<Field>(container, fr['inspector.name']);
    await act(async () => name.focus());
    await typeInto(name, 'Abandonné');
    press(name, 'Escape');
    expect(name.value).toBe('Demo');
    await act(async () => name.blur());
    expect(history(container)).toEqual([]);
  });

  it('follows an undo and a redo: the field shows what the project holds', async () => {
    const { container } = await open();
    await edit(container, fr['inspector.name'], 'Un');
    await click(button(container, fr['history.undo']));
    expect(value(container, fr['inspector.name'])).toBe('Demo');
    await click(button(container, fr['history.redo']));
    expect(value(container, fr['inspector.name'])).toBe('Un');
  });

  it('does not refuse a name that is empty: the project then does not validate, and the panel says so', async () => {
    const { container } = await open();
    await edit(container, fr['inspector.name'], '');
    const panel = container.querySelector('section.zone-panel') as HTMLElement;
    await settle(() => expect(panel.textContent).toContain(fr['panel.problems.one']));
    expect(panel.querySelector('.problems-list li')?.textContent).toContain('/project/name');
  });
});

describe('changing the key or the route of a page', () => {
  it('changes the key, and the list of the pages shows it', async () => {
    const { container } = await open();
    await edit(container, fr['inspector.pageKey'], 'accueil');
    expect(pagesOf(container)).toEqual(['accueil']);
    expect(container.querySelector('.page-view h2')?.textContent).toBe('accueil');
    expect(history(container)).toEqual([fr['command.pageRename']]);
  });

  it('changes the route', async () => {
    const { services, container } = await open();
    await edit(container, fr['inspector.pageRoute'], '/debut');
    const state = services.project.view.getState();
    expect(state?.pages.byId[state.initialPageId]?.route).toBe('/debut');
    expect(state?.routes[0]?.route).toBe('/debut');
  });

  it('says that a key or a route is taken, gives the old value back, and keeps nothing', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(pagesOf(container)).toHaveLength(2));
    await click(button(container, 'orders'));
    const before = history(container);

    await edit(container, fr['inspector.pageKey'], 'home');
    const key = field<Field>(container, fr['inspector.pageKey']);
    expect(key.value).toBe('orders');
    expect(key.getAttribute('aria-invalid')).toBe('true');
    const error = container.querySelector(`[id="${key.getAttribute('aria-describedby')}"]`);
    expect(error?.textContent).toBe(fr['pages.error.keyTaken']);
    expect(error?.getAttribute('role')).toBe('alert');

    await edit(container, fr['inspector.pageRoute'], '/');
    expect(value(container, fr['inspector.pageRoute'])).toBe('/orders');
    expect(field<Field>(container, fr['inspector.pageRoute']).getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(history(container)).toEqual(before);
  });

  it('stops saying it once a change is made', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(pagesOf(container)).toHaveLength(2));
    await click(button(container, 'orders'));
    await edit(container, fr['inspector.pageKey'], 'home');
    expect(field<Field>(container, fr['inspector.pageKey']).getAttribute('aria-invalid')).toBe(
      'true',
    );
    await edit(container, fr['inspector.pageKey'], 'commandes');
    const key = field<Field>(container, fr['inspector.pageKey']);
    expect(key.getAttribute('aria-invalid')).toBe('false');
    expect(key.getAttribute('aria-describedby')).toBeNull();
    expect(key.value).toBe('commandes');
  });

  it('does not carry the message of one page over to another that is chosen', async () => {
    const { services, container } = await open();
    await addPages(services, ['orders']);
    await settle(() => expect(pagesOf(container)).toHaveLength(2));
    await click(button(container, 'orders'));
    await edit(container, fr['inspector.pageKey'], 'home');
    expect(aside(container).querySelector('[role="alert"]')).not.toBeNull();

    await click(button(container, 'home'));
    expect(value(container, fr['inspector.pageKey'])).toBe('home');
    expect(aside(container).querySelector('[role="alert"]')).toBeNull();
    expect(field<Field>(container, fr['inspector.pageKey']).getAttribute('aria-invalid')).toBe(
      'false',
    );
  });

  it('does not refuse a key that does not follow RG-11: the panel says what is wrong', async () => {
    const { container } = await open();
    await edit(container, fr['inspector.pageKey'], 'Not A Key');
    const panel = container.querySelector('section.zone-panel') as HTMLElement;
    await settle(() => expect(panel.textContent).toContain(fr['panel.problems.one']));
    expect(panel.querySelector('.problems-list li')?.textContent).toContain('/key');
  });
});
