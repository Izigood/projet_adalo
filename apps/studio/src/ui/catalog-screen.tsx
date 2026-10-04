import type { CatalogEntry, DomainError, Id, Result } from '@acs/domain';
import { useId, useState } from 'react';
import { CATALOG_SORT_FIELDS } from '../catalog/query.js';
import type { CatalogQuery, CatalogSort } from '../catalog/query.js';
import { t } from '../i18n.js';
import type { MessageKey } from '../i18n.js';
import { CreateProjectForm } from './create-project-form.js';
import { errorMessage } from './errors.js';
import { daysUntilPurge, formatDateTime } from './format.js';
import { useServices } from './services-context.js';
import { useCatalog } from './use-catalog.js';

type Status = NonNullable<CatalogQuery['status']>;

/** The labels, by literal key, so that the control of unused labels can see they are used. */
const STATUS_LABELS: Readonly<Record<Status, MessageKey>> = {
  active: 'catalog.status.active',
  archived: 'catalog.status.archived',
  trashed: 'catalog.status.trashed',
  all: 'catalog.status.all',
};

const SORT_LABELS: Readonly<Record<CatalogSort['field'], MessageKey>> = {
  updatedAt: 'catalog.sort.updatedAt',
  createdAt: 'catalog.sort.createdAt',
  name: 'catalog.sort.name',
  key: 'catalog.sort.key',
};

type Action = 'open' | 'duplicate' | 'archive' | 'trash' | 'restore';

/** What an action says on its button, and in full (with the project) for a screen reader. */
const ACTION_LABELS: Readonly<Record<Action, { short: MessageKey; named: MessageKey }>> = {
  open: { short: 'catalog.open', named: 'catalog.openNamed' },
  duplicate: { short: 'catalog.duplicate', named: 'catalog.duplicateNamed' },
  archive: { short: 'catalog.archive', named: 'catalog.archiveNamed' },
  trash: { short: 'catalog.trash', named: 'catalog.trashNamed' },
  restore: { short: 'catalog.restore', named: 'catalog.restoreNamed' },
};

/** The actions that make sense for a project, by its state. */
const ACTIONS_BY_STATUS: Readonly<Record<CatalogEntry['status'], readonly Action[]>> = {
  active: ['open', 'duplicate', 'archive', 'trash'],
  archived: ['open', 'duplicate', 'restore', 'trash'],
  trashed: ['duplicate', 'restore'],
};

/** The line that says what the trash will do with a project. */
function trashNote(entry: CatalogEntry): string | null {
  const days = daysUntilPurge(entry, new Date().toISOString());
  if (days === undefined) return null;
  if (days === 0) return t('catalog.trashed.due');
  return days === 1 ? t('catalog.trashed.one') : t('catalog.trashed.other', { days });
}

/**
 * The catalogue of projects (EF-PRJ-02): search, filter by state, sort, and for each project what
 * can be done with it. It is what the work area shows while no project is open.
 */
export function CatalogScreen() {
  const { catalog, session } = useServices();
  const ids = useId();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [sort, setSort] = useState<CatalogSort>({ field: 'updatedAt', dir: 'desc' });
  const listing = useCatalog({ search, status, sort });

  /** Runs a change of the catalogue, shows why it was refused, and reads the list again. */
  async function change(work: () => Promise<Result<unknown, DomainError>>) {
    const result = await work();
    listing.fail(result.ok ? null : result.error);
    if (result.ok) await listing.refresh();
  }

  const run = (action: Action, id: Id): Promise<void> => {
    switch (action) {
      case 'open':
        return session.open(id).then((result) => listing.fail(result.ok ? null : result.error));
      case 'duplicate':
        return change(() => catalog.duplicate(id));
      case 'archive':
        return change(() => catalog.archive(id));
      case 'trash':
        return change(() => catalog.trash(id));
      case 'restore':
        return change(() => catalog.restore(id));
    }
  };

  return (
    <section className="catalog" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>{t('catalog.title')}</h2>
      <p>{t('studio.subtitle')}</p>
      {listing.purged === 0 ? null : (
        <div className="banner" role="status">
          {listing.purged === 1
            ? t('catalog.purged.one')
            : t('catalog.purged.other', { count: listing.purged })}
        </div>
      )}
      {listing.error === null ? null : (
        <div className="banner banner-failure" role="alert">
          {errorMessage(listing.error)}
        </div>
      )}

      <CreateProjectForm />

      <div className="catalog-controls" role="search">
        <label htmlFor={`${ids}-search`}>{t('catalog.search')}</label>
        <input
          id={`${ids}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor={`${ids}-status`}>{t('catalog.status')}</label>
        <select
          id={`${ids}-status`}
          value={status}
          onChange={(event) => setStatus(event.target.value as Status)}
        >
          {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
            <option key={value} value={value}>
              {t(STATUS_LABELS[value])}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-sort`}>{t('catalog.sort')}</label>
        <select
          id={`${ids}-sort`}
          value={sort.field}
          onChange={(event) =>
            setSort({ ...sort, field: event.target.value as CatalogSort['field'] })
          }
        >
          {CATALOG_SORT_FIELDS.map((field) => (
            <option key={field} value={field}>
              {t(SORT_LABELS[field])}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-dir`}>{t('catalog.dir')}</label>
        <select
          id={`${ids}-dir`}
          value={sort.dir}
          onChange={(event) => setSort({ ...sort, dir: event.target.value as CatalogSort['dir'] })}
        >
          <option value="desc">{t('catalog.dir.desc')}</option>
          <option value="asc">{t('catalog.dir.asc')}</option>
        </select>
      </div>

      {listing.entries.length === 0 && listing.error === null ? (
        <div className="catalog-empty">
          {search.trim() === '' ? t('catalog.empty') : t('catalog.noMatch')}
        </div>
      ) : (
        <ul className="catalog-list">
          {listing.entries.map((entry) => {
            const note = trashNote(entry);
            return (
              <li key={entry.id} className="catalog-item">
                <h3>{entry.name}</h3>
                <div className="catalog-meta">
                  {entry.author === ''
                    ? t('catalog.meta', { key: entry.key, version: entry.version })
                    : t('catalog.metaWithAuthor', {
                        key: entry.key,
                        version: entry.version,
                        author: entry.author,
                      })}
                </div>
                {entry.description === '' ? null : (
                  <div className="catalog-description">{entry.description}</div>
                )}
                <div className="catalog-meta">
                  {t('catalog.updated', { date: formatDateTime(entry.updatedAt) })}
                </div>
                {note === null ? null : <div className="catalog-meta">{note}</div>}
                <div className="catalog-actions">
                  {ACTIONS_BY_STATUS[entry.status].map((action) => (
                    <button
                      key={action}
                      type="button"
                      aria-label={t(ACTION_LABELS[action].named, { name: entry.name })}
                      onClick={() => void run(action, entry.id)}
                    >
                      {t(ACTION_LABELS[action].short)}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
