import type { CatalogEntry, DomainError, Id } from '@acs/domain';
import { domainError, err } from '@acs/domain';
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
import { pageRename } from '../commands/page-commands.js';
import { createProject } from '../project/create-project.js';
import { summaryOf, toFiles } from '../project/project-state.js';
import { t } from '../i18n.js';
import fr from '../locales/fr.json';
import { createStudioServices } from '../services.js';
import type { StudioServices } from '../services.js';
import { errorMessage } from './errors.js';
import { daysUntilPurge, formatDateTime } from './format.js';

afterEach(unmountAll);

const NOW = Date.now();
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();

type Seed = {
  key: string;
  name?: string;
  description?: string;
  author?: string;
  at?: string;
  status?: 'archived' | 'trashed';
  trashedAt?: string;
};

/** Puts projects in the store, with the dates the test wants; no project is opened. */
async function seed(services: StudioServices, projects: Seed[]): Promise<Id[]> {
  const ids: Id[] = [];
  for (const wanted of projects) {
    const made = createProject({
      key: wanted.key,
      name: wanted.name ?? `Projet ${wanted.key}`,
      description: wanted.description ?? '',
      author: wanted.author ?? '',
    });
    if (!made.ok) throw new Error(made.error.message);
    const at = wanted.at ?? iso(-1);
    const stored = await services.store.create(summaryOf(made.value), toFiles(made.value), at);
    if (!stored.ok) throw new Error(stored.error.message);
    if (wanted.status !== undefined) {
      await services.store.setStatus(stored.value.id, wanted.status, wanted.trashedAt ?? at);
    }
    ids.push(stored.value.id);
  }
  return ids;
}

const names = (container: HTMLElement) =>
  [...container.querySelectorAll('.catalog-item h3')].map((heading) => heading.textContent);

/** The screen, once the catalogue has been read. */
async function open(services: StudioServices, expected: number) {
  const container = await renderStudio(services);
  await settle(() => expect(names(container)).toHaveLength(expected));
  return container;
}

describe('the catalogue screen (EF-PRJ-02)', () => {
  it('says there is no project, under a title that names the screen, and the Studio is ready', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    await settle(() =>
      expect(container.querySelector('.catalog-empty')?.textContent).toBe(fr['catalog.empty']),
    );
    expect(container.querySelector('h2')?.textContent).toBe(fr['catalog.title']);
    expect(container.querySelector('section.catalog')?.getAttribute('aria-labelledby')).toBe(
      container.querySelector('h2')?.id,
    );
    expect(container.querySelector('p')?.textContent).toBe(fr['studio.subtitle']);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('lists the active projects with what is known of each', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'AA', name: 'Gestion', description: 'Suivi des ventes', author: 'Ada', at: iso(-2) },
      { key: 'BB', name: 'Stock' },
    ]);
    const container = await open(services, 2);
    const items = [...container.querySelectorAll('.catalog-item')];
    const gestion = items.find((item) => item.querySelector('h3')?.textContent === 'Gestion');
    const metas = [...(gestion?.querySelectorAll('.catalog-meta') ?? [])].map((m) => m.textContent);
    expect(metas).toEqual([
      t('catalog.metaWithAuthor', { key: 'AA', version: '0.1.0', author: 'Ada' }),
      t('catalog.updated', { date: formatDateTime(iso(-2)) }),
    ]);
    expect(gestion?.querySelector('.catalog-description')?.textContent).toBe('Suivi des ventes');
    const stock = items.find((item) => item.querySelector('h3')?.textContent === 'Stock');
    expect(stock?.querySelector('.catalog-meta')?.textContent).toBe(
      t('catalog.meta', { key: 'BB', version: '0.1.0' }),
    );
    expect(stock?.querySelector('.catalog-description')).toBeNull();
  });

  it('hides the archived projects and the trash, and shows them when asked', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'ACT', name: 'Actif' },
      { key: 'ARC', name: 'Archivé', status: 'archived' },
      { key: 'TRA', name: 'Supprimé', status: 'trashed', trashedAt: iso(-1) },
    ]);
    const container = await open(services, 1);
    expect(names(container)).toEqual(['Actif']);
    const status = field<HTMLSelectElement>(container, fr['catalog.status']);
    await typeInto(status, 'archived');
    await settle(() => expect(names(container)).toEqual(['Archivé']));
    await typeInto(status, 'trashed');
    await settle(() => expect(names(container)).toEqual(['Supprimé']));
    await typeInto(status, 'all');
    await settle(() => expect(names(container)).toHaveLength(3));
  });

  it('narrows the list as the search is typed, says when nothing matches, and gives it all back', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'AA', name: 'Gestion clients' },
      { key: 'BB', name: 'Équipe stock' },
    ]);
    const container = await open(services, 2);
    const search = field<HTMLInputElement>(container, fr['catalog.search']);
    await typeInto(search, 'equipe');
    await settle(() => expect(names(container)).toEqual(['Équipe stock']));
    await typeInto(search, 'introuvable');
    await settle(() =>
      expect(container.querySelector('.catalog-empty')?.textContent).toBe(fr['catalog.noMatch']),
    );
    expect(container.querySelector('.catalog-list')).toBeNull();
    await typeInto(search, '');
    await settle(() => expect(names(container)).toHaveLength(2));
  });

  it('sorts by the field and the order that are chosen, the last changed first to begin with', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'CC', name: 'Charlie', at: iso(-3) },
      { key: 'AA', name: 'Alpha', at: iso(-1) },
      { key: 'BB', name: 'Bravo', at: iso(-2) },
    ]);
    const container = await open(services, 3);
    expect(names(container)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    const dir = field<HTMLSelectElement>(container, fr['catalog.dir']);
    await typeInto(dir, 'asc');
    await settle(() => expect(names(container)).toEqual(['Charlie', 'Bravo', 'Alpha']));
    await typeInto(field<HTMLSelectElement>(container, fr['catalog.sort']), 'name');
    await settle(() => expect(names(container)).toEqual(['Alpha', 'Bravo', 'Charlie']));
    await typeInto(dir, 'desc');
    await settle(() => expect(names(container)).toEqual(['Charlie', 'Bravo', 'Alpha']));
    await typeInto(field<HTMLSelectElement>(container, fr['catalog.sort']), 'key');
    await settle(() => expect(names(container)).toEqual(['Charlie', 'Bravo', 'Alpha']));
  });

  it('labels every control, so that a screen reader names it', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    for (const label of [
      'catalog.search',
      'catalog.status',
      'catalog.sort',
      'catalog.dir',
    ] as const) {
      expect(field(container, fr[label])).toBeTruthy();
    }
    expect(container.querySelector('[role="search"]')).not.toBeNull();
  });
});

describe('what can be done with a project', () => {
  const labels = (container: HTMLElement, name: string) => {
    const item = [...container.querySelectorAll('.catalog-item')].find(
      (candidate) => candidate.querySelector('h3')?.textContent === name,
    );
    return [...(item?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
  };

  it('depends on its state: open, copy, archive or trash for an active one; open, copy, restore or trash for an archived one; copy or restore for one in the trash', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'ACT', name: 'Actif' },
      { key: 'ARC', name: 'Archivé', status: 'archived' },
      { key: 'TRA', name: 'Supprimé', status: 'trashed', trashedAt: iso(-1) },
    ]);
    const container = await open(services, 1);
    expect(labels(container, 'Actif')).toEqual([
      'Ouvrir',
      'Dupliquer',
      'Archiver',
      'Mettre à la corbeille',
    ]);
    await typeInto(field<HTMLSelectElement>(container, fr['catalog.status']), 'all');
    await settle(() => expect(names(container)).toHaveLength(3));
    expect(labels(container, 'Archivé')).toEqual([
      'Ouvrir',
      'Dupliquer',
      'Restaurer',
      'Mettre à la corbeille',
    ]);
    expect(labels(container, 'Supprimé')).toEqual(['Dupliquer', 'Restaurer']);
  });

  it('names the project in what a screen reader says, and keeps the short word on the button', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'ACT', name: 'Gestion' }]);
    const container = await open(services, 1);
    const buttons = [...container.querySelectorAll('.catalog-actions button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Ouvrir Gestion',
      'Dupliquer Gestion',
      'Archiver Gestion',
      'Mettre Gestion à la corbeille',
    ]);
    for (const b of buttons) {
      // The accessible name starts with the visible word (WCAG 2.5.3), or says it in full.
      const visible = b.textContent ?? '';
      const accessible = b.getAttribute('aria-label') ?? '';
      expect(accessible.includes(visible.split(' ')[0] ?? '')).toBe(true);
    }
  });

  it('opens a project: the catalogue gives way to it', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'ACT', name: 'Gestion' }]);
    const container = await open(services, 1);
    await click(button(container, 'Ouvrir Gestion'), () =>
      expect(container.querySelector('.project-name')?.textContent).toBe('Gestion'),
    );
    expect(container.querySelector('.catalog')).toBeNull();
    expect(services.session.current()).not.toBeNull();
  });

  it('offers the draft of a project that is opened, with the project as it was saved', async () => {
    const source = browser();
    const first = createStudioServices(source);
    const made = await first.session.create({ key: 'DEMO', name: 'Demo' });
    if (!made.ok) throw new Error(made.error.message);
    const home = first.project.view.getState()?.initialPageId;
    if (home === undefined) throw new Error('no project');
    first.bus.execute(pageRename({ pageId: home, key: 'Not A Key' }));
    await first.session.flush();
    await first.session.close();

    const services = createStudioServices(source);
    const container = await open(services, 1);
    await click(button(container, 'Ouvrir Demo'), () =>
      expect(container.querySelector('[role="alert"]')).not.toBeNull(),
    );
    expect(button(container, fr['recovery.recover'])).toBeTruthy();
  });

  it('duplicates a project: the copy is listed, with a key and a name of its own', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'DEMO', name: 'Mon appli' }]);
    const container = await open(services, 1);
    await click(button(container, 'Dupliquer Mon appli'), () =>
      expect(names(container).sort()).toEqual(['Mon appli', 'Mon appli (copie)']),
    );
    const copy = [...container.querySelectorAll('.catalog-item')].find(
      (item) => item.querySelector('h3')?.textContent === 'Mon appli (copie)',
    );
    expect(copy?.querySelector('.catalog-meta')?.textContent).toBe(
      t('catalog.meta', { key: 'DEMO2', version: '0.1.0' }),
    );
  });

  it('archives a project, which leaves the active ones, and restores it', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'DEMO', name: 'Gestion' }]);
    const container = await open(services, 1);
    await click(button(container, 'Archiver Gestion'), () => expect(names(container)).toEqual([]));
    const status = field<HTMLSelectElement>(container, fr['catalog.status']);
    await typeInto(status, 'archived');
    await settle(() => expect(names(container)).toEqual(['Gestion']));
    await click(button(container, 'Restaurer Gestion'), () => expect(names(container)).toEqual([]));
    await typeInto(status, 'active');
    await settle(() => expect(names(container)).toEqual(['Gestion']));
  });

  it('puts a project in the trash, says when it goes for good, and takes it back', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'DEMO', name: 'Gestion' }]);
    const container = await open(services, 1);
    await click(button(container, 'Mettre Gestion à la corbeille'), () =>
      expect(names(container)).toEqual([]),
    );
    const status = field<HTMLSelectElement>(container, fr['catalog.status']);
    await typeInto(status, 'trashed');
    await settle(() => expect(names(container)).toEqual(['Gestion']));
    expect(container.querySelector('.catalog-item')?.textContent).toContain(
      t('catalog.trashed.other', { days: 30 }),
    );
    await click(button(container, 'Restaurer Gestion'), () => expect(names(container)).toEqual([]));
    await typeInto(status, 'active');
    await settle(() => expect(names(container)).toEqual(['Gestion']));
  });

  it('says how long a project in the trash has left, in the singular and the plural', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'AA', name: 'Presque', status: 'trashed', trashedAt: iso(-29.5) },
      { key: 'BB', name: 'Encore', status: 'trashed', trashedAt: iso(-5) },
    ]);
    const container = await renderStudio(services);
    await typeInto(field<HTMLSelectElement>(container, fr['catalog.status']), 'trashed');
    await settle(() => expect(names(container)).toHaveLength(2));
    const note = (name: string) =>
      [...container.querySelectorAll('.catalog-item')].find(
        (item) => item.querySelector('h3')?.textContent === name,
      )?.textContent ?? '';
    expect(note('Presque')).toContain(fr['catalog.trashed.one']);
    expect(note('Encore')).toContain(t('catalog.trashed.other', { days: 25 }));
  });
});

describe('opening the catalogue lets go of the old trash', () => {
  it('says how many projects went, in the singular and the plural, and lists no more of them', async () => {
    const one = createStudioServices(browser());
    await seed(one, [
      { key: 'OLD', name: 'Ancien', status: 'trashed', trashedAt: iso(-31) },
      { key: 'NEW', name: 'Récent' },
    ]);
    const container = await open(one, 1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(fr['catalog.purged.one']);
    await typeInto(field<HTMLSelectElement>(container, fr['catalog.status']), 'all');
    await settle(() => expect(names(container)).toEqual(['Récent']));

    const two = createStudioServices(browser());
    await seed(two, [
      { key: 'OLD', name: 'Ancien', status: 'trashed', trashedAt: iso(-31) },
      { key: 'OLDER', name: 'Plus ancien', status: 'trashed', trashedAt: iso(-60) },
    ]);
    const second = await renderStudio(two);
    await settle(() =>
      expect(second.querySelector('[role="status"]')?.textContent).toBe(
        t('catalog.purged.other', { count: 2 }),
      ),
    );
  });

  it('says nothing when nothing went', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'NEW', name: 'Récent' }]);
    const container = await open(services, 1);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('when something goes wrong', () => {
  it('says that the storage is not there, and not that there is no project', async () => {
    const services = createStudioServices({});
    const container = await renderStudio(services);
    await settle(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(fr['error.storage']),
    );
    expect(container.querySelector('.catalog-empty')).toBeNull();
  });

  it('says why a change was refused, and the message goes once a change works', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'DEMO', name: 'Gestion' }]);
    const container = await open(services, 1);
    const archive = services.catalog.archive;
    services.catalog.archive = () =>
      Promise.resolve(err(domainError('CONSTRAINT_VIOLATION', 'no', { details: { field: 'id' } })));
    await click(button(container, 'Archiver Gestion'), () =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(fr['error.generic']),
    );
    expect(names(container)).toEqual(['Gestion']);
    services.catalog.archive = archive;
    await click(button(container, 'Archiver Gestion'), () =>
      expect(container.querySelector('[role="alert"]')).toBeNull(),
    );
  });

  it('says why a project could not be opened, and keeps the catalogue', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'DEMO', name: 'Gestion' }]);
    const container = await open(services, 1);
    services.session.open = () => Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk')));
    await click(button(container, 'Ouvrir Gestion'), () =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(fr['error.storage']),
    );
    expect(names(container)).toEqual(['Gestion']);
    expect(services.session.current()).toBeNull();
  });

  it('stops saying that the list could not be read as soon as it can be', async () => {
    const services = createStudioServices(browser());
    await seed(services, [{ key: 'DEMO', name: 'Gestion' }]);
    const container = await open(services, 1);
    const list = services.catalog.list;
    services.catalog.list = () => Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk')));
    const search = field<HTMLInputElement>(container, fr['catalog.search']);
    await typeInto(search, 'g');
    await settle(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(fr['error.storage']),
    );
    services.catalog.list = list;
    await typeInto(search, 'ge');
    await settle(() => expect(container.querySelector('[role="alert"]')).toBeNull());
    expect(names(container)).toEqual(['Gestion']);
  });

  it('keeps the list of the last question asked when the answers come back in the wrong order', async () => {
    const services = createStudioServices(browser());
    await seed(services, [
      { key: 'AA', name: 'Alpha' },
      { key: 'BB', name: 'Bravo' },
    ]);
    const container = await open(services, 2);
    const list = services.catalog.list;
    const gates: (() => void)[] = [];
    services.catalog.list = (query) =>
      new Promise<Awaited<ReturnType<typeof list>>>((resolve) => {
        gates.push(() => void list(query).then(resolve));
      });
    const search = field<HTMLInputElement>(container, fr['catalog.search']);
    await typeInto(search, 'alpha');
    await typeInto(search, 'bravo');
    expect(gates).toHaveLength(2);
    // The answer to the second question comes first, the first one's comes last and is dropped.
    gates[1]?.();
    await settle(() => expect(names(container)).toEqual(['Bravo']));
    gates[0]?.();
    await settle(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(names(container)).toEqual(['Bravo']);
  });
});

describe('the words of the errors', () => {
  const error = (code: DomainError['code'], details?: Record<string, unknown>): DomainError =>
    domainError(code, 'x', details === undefined ? {} : { details });

  it('tell what to understand, not the code', () => {
    expect(errorMessage(error('STORAGE_UNAVAILABLE'))).toBe(fr['error.storage']);
    expect(errorMessage(error('STORAGE_QUOTA'))).toBe(fr['error.storage']);
    expect(errorMessage(error('CONSTRAINT_VIOLATION', { field: 'key' }))).toBe(
      fr['error.keyTaken'],
    );
    expect(errorMessage(error('CONSTRAINT_VIOLATION', { field: 'id' }))).toBe(fr['error.generic']);
    expect(errorMessage(error('CONSTRAINT_VIOLATION'))).toBe(fr['error.generic']);
    expect(errorMessage(error('VERSION_CONFLICT'))).toBe(fr['error.generic']);
  });
});

describe('the days left in the trash', () => {
  const TRASHED = '2026-10-01T00:00:00.000Z';
  const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
    id: '01920000-0000-7000-8000-000000000001' as Id,
    key: 'DEMO',
    name: 'Demo',
    description: '',
    author: '',
    version: '0.1.0',
    locale: 'fr-FR',
    status: 'trashed',
    revision: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  });

  it('counts upward, from 30 to 0, and says nothing for a project that is not in the trash', () => {
    const inTrash = entry({ trashedAt: TRASHED });
    expect(daysUntilPurge(inTrash, '2026-10-01T00:00:00.000Z')).toBe(30);
    expect(daysUntilPurge(inTrash, '2026-10-01T12:00:00.000Z')).toBe(30);
    expect(daysUntilPurge(inTrash, '2026-10-02T00:00:00.000Z')).toBe(29);
    expect(daysUntilPurge(inTrash, '2026-10-30T12:00:00.000Z')).toBe(1);
    expect(daysUntilPurge(inTrash, '2026-10-31T00:00:00.000Z')).toBe(0);
    expect(daysUntilPurge(inTrash, '2026-12-31T00:00:00.000Z')).toBe(0);
    expect(
      daysUntilPurge(entry({ status: 'active', trashedAt: TRASHED }), '2026-10-02T00:00:00.000Z'),
    ).toBeUndefined();
    const undated = entry({ status: 'trashed' });
    expect(daysUntilPurge(undated, '2026-10-02T00:00:00.000Z')).toBeUndefined();
  });
});
