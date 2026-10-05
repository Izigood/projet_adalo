import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app.js';
import { pageRename } from '../commands/page-commands.js';
import { projectUpdate } from '../commands/project-commands.js';
import { t } from '../i18n.js';
import fr from '../locales/fr.json';
import { createStudioServices } from '../services.js';
import type { StudioKit } from '../services.js';
import { saveMessage } from './save-badge.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

async function render() {
  const services: StudioKit = createStudioServices({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<App services={services} />));
  return { services, container };
}

async function open(services: StudioKit, key = 'DEMO', name = 'Demo') {
  const made = await act(async () => services.session.create({ key, name }));
  if (!made.ok) throw new Error(made.error.message);
  return made.value.id;
}

const button = (container: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (found === undefined) throw new Error(`no button « ${label} »`);
  return found;
};

function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => void target.dispatchEvent(event));
  return event;
}

describe('the five zones (ARC-STU-01)', () => {
  it('gives the top bar, the navigation, the work area, the inspector and the panel, each a landmark', async () => {
    const { container } = await render();
    expect(container.querySelector('header h1')?.textContent).toBe(fr['studio.title']);
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(fr['zone.nav']);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe(fr['zone.inspector']);
    expect(container.querySelector('section.zone-panel')?.getAttribute('aria-label')).toBe(
      fr['zone.panel'],
    );
  });

  it('says there is no project open, and has nothing to undo, redo or save', async () => {
    const { container } = await render();
    expect(container.querySelector('main')?.textContent).toContain(fr['studio.subtitle']);
    expect(button(container, fr['history.undo']).disabled).toBe(true);
    expect(button(container, fr['history.redo']).disabled).toBe(true);
    expect(container.querySelector('output')?.textContent).toBe('');
  });

  it('shows the name of the open project, and follows a change of it', async () => {
    const { services, container } = await render();
    await open(services);
    expect(container.querySelector('.project-name')?.textContent).toBe('Demo');
    expect(container.querySelector('main')?.textContent).not.toContain(fr['studio.subtitle']);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Renommé' })));
    expect(container.querySelector('.project-name')?.textContent).toBe('Renommé');
  });
});

describe('undo and redo (EF-UI-06)', () => {
  it('enables the buttons when there is something to do, and says which command in the title', async () => {
    const { services, container } = await render();
    await open(services);
    expect(button(container, fr['history.undo']).disabled).toBe(true);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    const undo = button(container, fr['history.undo']);
    expect(undo.disabled).toBe(false);
    expect(undo.title).toBe(t('history.undoTitle', { label: fr['command.projectUpdate'] }));
    expect(button(container, fr['history.redo']).disabled).toBe(true);
  });

  it('undoes and redoes when the buttons are pressed', async () => {
    const { services, container } = await render();
    await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    await act(async () => button(container, fr['history.undo']).click());
    expect(container.querySelector('.project-name')?.textContent).toBe('Demo');
    expect(button(container, fr['history.redo']).title).toBe(
      t('history.redoTitle', { label: fr['command.projectUpdate'] }),
    );
    await act(async () => button(container, fr['history.redo']).click());
    expect(container.querySelector('.project-name')?.textContent).toBe('Un');
  });

  it('undoes with Ctrl+Z or Cmd+Z, and redoes with Ctrl+Shift+Z, Cmd+Shift+Z or Ctrl+Y', async () => {
    const { services, container } = await render();
    await open(services);
    const name = () => container.querySelector('.project-name')?.textContent;
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Deux' })));

    expect(press('z', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(name()).toBe('Un');
    press('z', { metaKey: true });
    expect(name()).toBe('Demo');
    press('z', { ctrlKey: true, shiftKey: true });
    expect(name()).toBe('Un');
    press('Z', { metaKey: true, shiftKey: true });
    expect(name()).toBe('Deux');
    press('z', { ctrlKey: true });
    press('y', { ctrlKey: true });
    expect(name()).toBe('Deux');
  });

  it('leaves the keys alone when they are not for the history', async () => {
    const { services, container } = await render();
    await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    const name = () => container.querySelector('.project-name')?.textContent;

    expect(press('z').defaultPrevented).toBe(false);
    expect(press('z', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(press('y', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press('x', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(name()).toBe('Un');
  });

  it('leaves Ctrl+Z to the field that is being typed in, which has its own undo', async () => {
    const { services, container } = await render();
    await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    for (const tag of ['input', 'textarea', 'select']) {
      const field = document.createElement(tag);
      container.append(field);
      expect(press('z', { ctrlKey: true }, field).defaultPrevented).toBe(false);
    }
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    container.append(editable);
    expect(press('z', { ctrlKey: true }, editable).defaultPrevented).toBe(false);
    expect(container.querySelector('.project-name')?.textContent).toBe('Un');
  });
});

describe('the save status (RG-13)', () => {
  const badge = (container: HTMLElement) => container.querySelector('output')?.textContent;

  it('says unsaved, then saved, and announces it politely', async () => {
    const { services, container } = await render();
    await open(services);
    expect(badge(container)).toBe(fr['save.saved']);
    expect(container.querySelector('output')?.getAttribute('aria-live')).toBe('polite');
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    expect(badge(container)).toBe(fr['save.unsaved']);
    await act(async () => services.session.flush());
    expect(badge(container)).toBe(fr['save.saved']);
  });

  it('says that the project is invalid and kept as a draft, with the number of problems', async () => {
    const { services, container } = await render();
    await open(services);
    const home = services.project.view.getState()?.initialPageId;
    if (home === undefined) throw new Error('no project');
    await act(
      async () => void services.bus.execute(pageRename({ pageId: home, key: 'Not A Key' })),
    );
    await act(async () => services.session.flush());
    expect(badge(container)).toMatch(/^Projet invalide \(\d+ problèmes?\) : brouillon conservé$/);
    expect(container.querySelector('output')?.className).toContain('save-draft');
  });

  it('says what each phase means, with the plural of the problems', () => {
    expect(saveMessage({ phase: 'idle' })).toBe('');
    expect(saveMessage({ phase: 'saving' })).toBe(fr['save.saving']);
    expect(saveMessage({ phase: 'conflict' })).toBe(fr['save.conflict']);
    expect(saveMessage({ phase: 'error' })).toBe(fr['save.error']);
    expect(saveMessage({ phase: 'draft', issues: 1 })).toBe(fr['save.draft.one']);
    expect(saveMessage({ phase: 'draft', issues: 2 })).toBe(
      'Projet invalide (2 problèmes) : brouillon conservé',
    );
    expect(saveMessage({ phase: 'draft' })).toBe(
      'Projet invalide (0 problèmes) : brouillon conservé',
    );
  });

  it('saves at once when the page goes to the background, and not when it comes back', async () => {
    const { services, container } = await render();
    const id = await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(badge(container)).toBe(fr['save.unsaved']);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    const stored = await services.store.load(id);
    expect(stored.ok && stored.value?.entry.name).toBe('Un');
    // The save that the page asked for is on its way; this waits for it to finish.
    await act(async () => services.session.flush());
    expect(badge(container)).toBe(fr['save.saved']);
  });
});

describe('saving when the page is left', () => {
  const hidden = () =>
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

  it('saves on pagehide as well, which a closing tab sends', async () => {
    const { services, container } = await render();
    const id = await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    hidden();
    // Only the event asks for the save here: nothing else calls flush, so a page that did not listen
    // would leave the store as it was.
    await act(async () => void window.dispatchEvent(new Event('pagehide')));
    await vi.waitFor(async () => {
      const stored = await services.store.load(id);
      expect(stored.ok && stored.value?.entry.name).toBe('Un');
    });
    await act(async () => services.session.flush());
    expect(container.querySelector('output')?.textContent).toBe(fr['save.saved']);
  });

  it('saves on pagehide even when the page does not say it is hidden yet', async () => {
    const { services } = await render();
    const id = await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => void window.dispatchEvent(new Event('pagehide')));
    await vi.waitFor(async () => {
      const stored = await services.store.load(id);
      expect(stored.ok && stored.value?.entry.name).toBe('Un');
    });
  });

  it('stops listening when the Studio is taken off the page', async () => {
    const { services, container } = await render();
    await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    const entry = mounted.find((item) => item.container === container);
    await act(async () => entry?.root.unmount());
    mounted.splice(mounted.indexOf(entry as (typeof mounted)[number]), 1);

    let calls = 0;
    const flush = services.session.flush;
    services.session.flush = () => {
      calls += 1;
      return flush();
    };
    hidden();
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => void window.dispatchEvent(new Event('pagehide')));
    expect(calls).toBe(0);
  });
});

describe('the shortcuts when the Studio is taken off the page', () => {
  it('no longer undo or redo anything', async () => {
    const { services, container } = await render();
    await open(services);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Un' })));
    const entry = mounted.find((item) => item.container === container);
    await act(async () => entry?.root.unmount());
    mounted.splice(mounted.indexOf(entry as (typeof mounted)[number]), 1);

    let calls = 0;
    const { undo, redo } = services.bus;
    services.bus.undo = () => {
      calls += 1;
      return undo();
    };
    services.bus.redo = () => {
      calls += 1;
      return redo();
    };
    press('z', { ctrlKey: true });
    press('y', { ctrlKey: true });
    expect(calls).toBe(0);
  });
});

describe('the labels', () => {
  it('replaces {name} by the parameter of that name, and leaves what is not given where it is', () => {
    expect(t('history.undoTitle', { label: 'Ajouter une page' })).toBe(
      'Annuler : Ajouter une page',
    );
    expect(t('history.undoTitle', { other: 'x' })).toBe('Annuler : {label}');
    expect(t('history.undoTitle')).toBe('Annuler : {label}');
    expect(t('save.draft.other', { count: 3 })).toBe(
      'Projet invalide (3 problèmes) : brouillon conservé',
    );
  });
});
