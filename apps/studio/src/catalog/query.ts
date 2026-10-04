import type { CatalogEntry, CatalogStatus } from '@acs/domain';

export const CATALOG_SORT_FIELDS = ['name', 'key', 'updatedAt', 'createdAt'] as const;

export type CatalogSort = {
  readonly field: (typeof CATALOG_SORT_FIELDS)[number];
  readonly dir: 'asc' | 'desc';
};

/** What the catalogue shows (EF-PRJ-02): a text to find, the state of the projects, the order. */
export type CatalogQuery = {
  /** Words that all have to be found in the name, key, description or author. */
  readonly search?: string;
  /** `active` by default: archived projects and the trash are looked at on purpose. */
  readonly status?: CatalogStatus | 'all';
  /** The most recently changed first, by default. */
  readonly sort?: CatalogSort;
};

export const DEFAULT_SORT: CatalogSort = { field: 'updatedAt', dir: 'desc' };

/** Lower case, without accents: « Équipe » is found by « equipe ». */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const names = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function compare(a: CatalogEntry, b: CatalogEntry, field: CatalogSort['field']): number {
  if (field === 'name' || field === 'key') return names.compare(a[field], b[field]);
  return Date.parse(a[field]) - Date.parse(b[field]);
}

/**
 * Searches, filters and sorts the catalogue. Pure: it reads the entries it is given and returns a
 * new list, whatever the order they came in. Equal entries keep a fixed order (their identifier),
 * so that the list does not jump about between two reads.
 */
export function queryCatalog(
  entries: readonly CatalogEntry[],
  query: CatalogQuery = {},
): CatalogEntry[] {
  const status = query.status ?? 'active';
  const terms = fold(query.search ?? '')
    .split(/\s+/)
    .filter((term) => term !== '');
  const { field, dir } = query.sort ?? DEFAULT_SORT;
  const sign = dir === 'asc' ? 1 : -1;

  return entries
    .filter((entry) => status === 'all' || entry.status === status)
    .filter((entry) => {
      if (terms.length === 0) return true;
      const text = fold([entry.name, entry.key, entry.description, entry.author].join('\n'));
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => sign * compare(a, b, field) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
