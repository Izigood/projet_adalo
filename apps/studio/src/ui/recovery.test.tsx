import type { PackageFiles } from '@acs/domain';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app.js';
import { pageRename } from '../commands/page-commands.js';
import { projectUpdate } from '../commands/project-commands.js';
import fr from '../locales/fr.json';
import { mountStudio } from '../mount.js';
import { createStudioServices } from '../services.js';
import type { ServicesSource, StudioServices } from '../services.js';
import { formatDateTime } from './format.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

const browser = (extra: Partial<ServicesSource> = {}): ServicesSource => ({
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  ...extra,
});

async function render(services: StudioServices) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<App services={services} />));
  return container;
}

const button = (container: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
  if (found === undefined) throw new Error(`no button « ${label} »`);
  return found;
};

/** A project whose draft is on offer: a tab left it invalid and closed without a word. */
async function withDraft() {
  const source = browser();
  const first = createStudioServices(source);
  const made = await first.session.create({ key: 'DEMO', name: 'Demo' });
  if (!made.ok) throw new Error(made.error.message);
  const home = first.project.view.getState()?.initialPageId;
  if (home === undefined) throw new Error('no project');
  first.bus.execute(pageRename({ pageId: home, key: 'Not A Key' }));
  await first.session.flush();
  const services = createStudioServices(source);
  await services.session.open(made.value.id);
  return { services, id: made.value.id };
}

describe('the recovery draft on screen (RG-13)', () => {
  it('shows nothing when there is no draft', async () => {
    const services = createStudioServices(browser());
    await services.session.create({ key: 'DEMO', name: 'Demo' });
    const container = await render(services);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('offers the draft with its date and the number of problems, and the project as it was saved', async () => {
    const { services } = await withDraft();
    const container = await render(services);
    const banner = container.querySelector('[role="alert"]');
    const offer = services.session.draft.getState();
    expect(offer?.issues).toBeGreaterThanOrEqual(1);
    const date = formatDateTime(offer?.savedAt ?? '');
    const expected =
      offer?.issues === 1
        ? `Un brouillon de récupération du ${date} contient des modifications non enregistrées (1 problème).`
        : `Un brouillon de récupération du ${date} contient des modifications non enregistrées (${offer?.issues} problèmes).`;
    expect(banner?.querySelector('p')?.textContent).toBe(expected);
    expect(button(container, fr['recovery.recover'])).toBeTruthy();
    expect(button(container, fr['recovery.dismiss'])).toBeTruthy();
    expect(
      services.project.view.getState()?.pages.byId[
        services.project.view.getState()?.initialPageId ?? ''
      ]?.key,
    ).toBe('home');
  });

  it.each([
    [
      'no problem',
      0,
      (date: string) =>
        `Un brouillon de récupération du ${date} contient des modifications non enregistrées.`,
    ],
    [
      'one problem',
      1,
      (date: string) =>
        `Un brouillon de récupération du ${date} contient des modifications non enregistrées (1 problème).`,
    ],
    [
      'several problems',
      3,
      (date: string) =>
        `Un brouillon de récupération du ${date} contient des modifications non enregistrées (3 problèmes).`,
    ],
  ])('says a draft with %s in the plural it needs', async (_name, wanted, message) => {
    const services = createStudioServices(browser());
    const made = await services.session.create({ key: 'DEMO', name: 'Demo' });
    if (!made.ok) throw new Error(made.error.message);
    const saved = await services.store.load(made.value.id);
    const files = structuredClone(saved.ok && saved.value ? saved.value.files : {}) as unknown as {
      'project.json': { project: Record<string, unknown> };
    };
    const { project } = files['project.json'];
    const breakers = [
      () => (project['key'] = 'demo'),
      () => (project['name'] = ''),
      () => (project['locale'] = 'francais'),
    ];
    breakers.slice(0, wanted).forEach((breakIt) => breakIt());
    await services.store.saveDraft({
      projectId: made.value.id,
      savedAt: '2026-10-05T10:00:00.000Z',
      baseRevision: 1,
      files: files as unknown as PackageFiles,
    });
    await services.session.open(made.value.id);
    expect(services.session.draft.getState()?.issues).toBe(wanted);
    const container = await render(services);
    expect(container.querySelector('[role="alert"] p')?.textContent).toBe(
      message(formatDateTime('2026-10-05T10:00:00.000Z')),
    );
  });

  it('takes the draft back when asked, and the banner goes', async () => {
    const { services } = await withDraft();
    const container = await render(services);
    await act(async () => button(container, fr['recovery.recover']).click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const state = services.project.view.getState();
    expect(state?.pages.byId[state.initialPageId]?.key).toBe('Not A Key');
  });

  it('throws the draft away when asked, and the project stays as it was saved', async () => {
    const { services, id } = await withDraft();
    const container = await render(services);
    await act(async () => button(container, fr['recovery.dismiss']).click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).toBeNull());
    expect(await services.store.loadDraft(id)).toEqual({ ok: true, value: null });
    const state = services.project.view.getState();
    expect(state?.pages.byId[state.initialPageId]?.key).toBe('home');
  });

  it('says so when the draft cannot be read, and keeps it so that it can be ignored', async () => {
    const services = createStudioServices(browser());
    const made = await services.session.create({ key: 'DEMO', name: 'Demo' });
    if (!made.ok) throw new Error(made.error.message);
    await services.store.saveDraft({
      projectId: made.value.id,
      savedAt: '2026-10-05T10:00:00.000Z',
      baseRevision: 1,
      files: {},
    });
    await services.session.open(made.value.id);
    const container = await render(services);
    await act(async () => button(container, fr['recovery.recover']).click());
    expect(container.querySelector('.banner-failure')?.textContent).toBe(fr['recovery.failed']);
    await act(async () => button(container, fr['recovery.dismiss']).click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).toBeNull());
  });

  it('says so when the draft cannot be thrown away, and stops saying it once it can', async () => {
    const { services } = await withDraft();
    const container = await render(services);
    const discard = services.store.discardDraft;
    services.store.discardDraft = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'disk', correlationId: 'x' },
      });
    await act(async () => button(container, fr['recovery.dismiss']).click());
    expect(container.querySelector('.banner-failure')?.textContent).toBe(
      fr['recovery.dismissFailed'],
    );
    services.store.discardDraft = discard;
    await act(async () => button(container, fr['recovery.dismiss']).click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).toBeNull());
  });
});

describe('closing the project', () => {
  it('has a button only while a project is open, which saves what waits and goes back', async () => {
    const services = createStudioServices(browser());
    const container = await render(services);
    expect(
      [...container.querySelectorAll('button')].some((b) => b.textContent === fr['project.close']),
    ).toBe(false);

    const made = await act(async () => services.session.create({ key: 'DEMO', name: 'Demo' }));
    if (!made.ok) throw new Error(made.error.message);
    await act(async () => void services.bus.execute(projectUpdate({ name: 'Avant fermeture' })));
    await act(async () => button(container, fr['project.close']).click());

    await vi.waitFor(() => expect(services.project.view.getState()).toBeNull());
    expect(container.querySelector('main')?.textContent).toContain(fr['studio.subtitle']);
    const stored = await services.store.load(made.value.id);
    expect(stored.ok && stored.value?.entry.name).toBe('Avant fermeture');
  });
});

describe('the storage that the browser may clear (RG-15)', () => {
  const notice = (container: HTMLElement) => container.querySelector('[role="status"]');

  async function mountWith(storage: ServicesSource['storage']) {
    const services = createStudioServices(browser(storage === undefined ? {} : { storage }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = await act(async () => mountStudio(container, services));
    mounted.push({ root, container });
    await act(async () => services.checkPersistence());
    return { services, container };
  }

  it('says nothing before the browser has answered, and nothing when the storage is persistent', async () => {
    const services = createStudioServices(browser());
    expect(services.persistence.getState()).toBe('unknown');
    const container = await render(services);
    expect(notice(container)).toBeNull();

    const { container: kept } = await mountWith({ persist: async () => true });
    expect(notice(kept)).toBeNull();
  });

  it('warns, and says to export, when the browser refuses to keep the data', async () => {
    const { container, services } = await mountWith({
      persisted: async () => false,
      persist: async () => false,
    });
    expect(services.persistence.getState()).toBe('best-effort');
    expect(notice(container)?.textContent).toBe(fr['persistence.warning']);
  });

  it('warns as well when the browser cannot be asked', async () => {
    const { container, services } = await mountWith({});
    expect(services.persistence.getState()).toBe('unsupported');
    expect(notice(container)?.textContent).toBe(fr['persistence.warning']);
  });

  it('asks as soon as the Studio is mounted', async () => {
    const services = createStudioServices(browser({ storage: { persist: async () => true } }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = await act(async () => mountStudio(container, services));
    mounted.push({ root, container });
    await act(async () => undefined);
    expect(services.persistence.getState()).toBe('persistent');
  });
});

describe('dates', () => {
  it('reads in French, in the time zone it is given', () => {
    expect(formatDateTime('2026-10-04T10:00:00.000Z', 'UTC')).toMatch(/4 octobre 2026.*10:00/);
    expect(formatDateTime('2026-10-04T10:00:00.000Z', 'Asia/Tokyo')).toMatch(
      /4 octobre 2026.*19:00/,
    );
  });

  it('gives back what is not a date', () => {
    expect(formatDateTime('hier')).toBe('hier');
  });
});
