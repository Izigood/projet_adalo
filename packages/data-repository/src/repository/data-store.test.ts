import type { Draft, Page, QuerySpec, RecordEnvelope, Repository } from '@acs/domain';
import { entityOf, referenceTo, relationOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { DataError } from '../errors.js';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { createDataStore } from './data-store.js';

type Row = RecordEnvelope & Record<string, unknown>;

const author = entityOf('author', { name: { type: 'string', required: true } });
const book = entityOf('book', {
  title: { type: 'string', required: true },
  author: referenceTo(author, { required: true }),
});

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

async function boot() {
  const layout = buildLayout([author, book], [relationOf(author, book, '1-N', 'cascade')]);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const result = await openEnvironment({
    projectKey: 'DEMO',
    environment: 'test',
    layout: layout.value,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!result.ok) throw new Error(result.error.message);
  opened.push(result.value);
  const store = createDataStore(result.value);
  const books: Repository<Row> = store.repository<Row>('book');
  const authors: Repository<Row> = store.repository<Row>('author');
  return { environment: result.value, store, books, authors };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const draft = (fields: Record<string, unknown>) => fields as Draft<Row>;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < 2000; waited += 5) {
    if (condition()) return;
    await wait(5);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Subscribes and keeps what it is told. */
function watch(
  repository: Repository<Row>,
  spec: QuerySpec,
): { pages: Page<Row>[]; errors: string[]; stop: () => void } {
  const pages: Page<Row>[] = [];
  const errors: string[] = [];
  const stop = repository.observe(spec).subscribe(
    (page) => pages.push(page),
    (error) => errors.push(error.code),
  );
  return { pages, errors, stop };
}

const titles = (page: Page<Row> | undefined) =>
  (page?.items ?? []).map((row) => String(row['title']));

describe('the Repository of the port', () => {
  it('reads, writes and queries one entity', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    const first = value(await books.save(draft({ title: 'One', author: ada.id })));
    expect(await books.get(first.id)).toEqual(first);
    const page = await books.query({ source: 'book', sort: [{ field: 'title', dir: 'asc' }] });
    expect(page.items.map((row) => row['title'])).toEqual(['One']);
    expect(books.entity).toBe('book');
  });

  it('throws a DataError with the business error where the port cannot return a Result', async () => {
    const { books } = await boot();
    const codes: string[] = [];
    for (const spec of [
      { source: 'author' },
      { source: 'book', where: 'x > 1' },
      { source: 'book', filter: { and: [{ field: 'nothing', op: 'eq' as const, value: 1 }] } },
      { source: 'book', page: { size: 0 } },
    ] satisfies QuerySpec[]) {
      const error = await books.query(spec).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(DataError);
      codes.push((error as DataError).error.code);
    }
    expect(codes).toEqual(['QUERY_INVALID', 'QUERY_INVALID', 'QUERY_INVALID', 'QUERY_INVALID']);
  });

  it('queries inside a transaction and sees what the transaction wrote', async () => {
    const { books } = await boot();
    const seen = await books.transaction(async (uow) => {
      const ada = value(await uow.of<Row>('author').save(draft({ name: 'Ada' })));
      value(await uow.of<Row>('book').save(draft({ title: 'Inside', author: ada.id })));
      const page = await uow.of<Row>('book').query({ source: 'book' });
      return titles(page);
    });
    expect(seen).toEqual(['Inside']);
  });

  it('a query refused inside a transaction undoes the transaction', async () => {
    const { books } = await boot();
    await expect(
      books.transaction(async (uow) => {
        const ada = value(await uow.of<Row>('author').save(draft({ name: 'Ada' })));
        value(await uow.of<Row>('book').save(draft({ title: 'Lost', author: ada.id })));
        await uow.of<Row>('book').query({ source: 'book', where: 'nope' });
      }),
    ).rejects.toBeInstanceOf(DataError);
    expect((await books.query({ source: 'book' })).items).toEqual([]);
  });
});

describe('observe: a query that follows the data', () => {
  it('gives the current page, then a new one after each write that changes it', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    value(await books.save(draft({ title: 'A', author: ada.id })));
    const seen = watch(books, { source: 'book', sort: [{ field: 'title', dir: 'asc' }] });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    expect(titles(seen.pages[0])).toEqual(['A']);

    const added = value(await books.save(draft({ title: 'B', author: ada.id })));
    await waitFor(() => seen.pages.length === 2, 'a page after a save');
    expect(titles(seen.pages[1])).toEqual(['A', 'B']);

    value(await books.delete(added.id));
    await waitFor(() => seen.pages.length === 3, 'a page after a delete');
    expect(titles(seen.pages[2])).toEqual(['A']);
    seen.stop();
  });

  it('is told of what a cascade removed from the entity it watches', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    value(await books.save(draft({ title: 'A', author: ada.id })));
    const seen = watch(books, { source: 'book' });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    value(await authors.delete(ada.id));
    await waitFor(() => seen.pages.length === 2, 'a page after the cascade');
    expect(seen.pages[1]?.items).toEqual([]);
    seen.stop();
  });

  it('does not repeat a page that has not changed, nor wake for another entity', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    value(await books.save(draft({ title: 'A', author: ada.id })));
    const seen = watch(books, {
      source: 'book',
      filter: { and: [{ field: 'title', op: 'startsWith', value: 'A' }] },
    });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    value(await authors.save(draft({ name: 'Grace' })));
    value(await books.save(draft({ title: 'Zzz', author: ada.id })));
    await wait(60);
    expect(seen.pages).toHaveLength(1);
    seen.stop();
  });

  it('stops when told to', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    const seen = watch(books, { source: 'book' });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    seen.stop();
    value(await books.save(draft({ title: 'After', author: ada.id })));
    await wait(60);
    expect(seen.pages).toHaveLength(1);
  });

  it('tells nothing of a read that was under way when it was told to stop', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    const seen = watch(books, { source: 'book' });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    // The save has told the listeners when it returns: the new read has started.
    value(await books.save(draft({ title: 'Late', author: ada.id })));
    seen.stop();
    await wait(60);
    expect(seen.pages).toHaveLength(1);
  });

  it('tells nothing of a transaction that was undone, and once of one that committed', async () => {
    const { books, authors } = await boot();
    const seen = watch(books, { source: 'book', sort: [{ field: 'title', dir: 'asc' }] });
    await waitFor(() => seen.pages.length === 1, 'the first page');

    await books
      .transaction(async (uow) => {
        const ada = value(await uow.of<Row>('author').save(draft({ name: 'Ada' })));
        value(await uow.of<Row>('book').save(draft({ title: 'Never', author: ada.id })));
        throw new Error('undo');
      })
      .catch(() => undefined);
    await wait(60);
    expect(seen.pages).toHaveLength(1);

    await books.transaction(async (uow) => {
      const ada = value(await uow.of<Row>('author').save(draft({ name: 'Ada' })));
      value(await uow.of<Row>('book').save(draft({ title: 'One', author: ada.id })));
      value(await uow.of<Row>('book').save(draft({ title: 'Two', author: ada.id })));
    });
    await waitFor(() => seen.pages.length === 2, 'the committed transaction');
    await wait(60);
    expect(seen.pages).toHaveLength(2);
    expect(titles(seen.pages[1])).toEqual(['One', 'Two']);
    expect(await authors.query({ source: 'author' })).toMatchObject({ items: [{}] });
    seen.stop();
  });

  it('follows aggregates and searches too', async () => {
    const { books, authors } = await boot();
    const ada = value(await authors.save(draft({ name: 'Ada' })));
    const seen = watch(books, {
      source: 'book',
      search: { text: 'moon', fields: ['title'] },
      aggregate: [{ fn: 'count', as: 'n' }],
    });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    expect(seen.pages[0]?.aggregates).toEqual({ n: 0 });
    value(await books.save(draft({ title: 'The Moon', author: ada.id })));
    value(await books.save(draft({ title: 'The Sun', author: ada.id })));
    await waitFor(() => seen.pages.length === 2, 'the moon');
    expect(seen.pages[1]?.aggregates).toEqual({ n: 1 });
    seen.stop();
  });

  it('refuses an invalid query when observe is called', async () => {
    const { books } = await boot();
    expect(() => books.observe({ source: 'book', where: 'x' })).toThrow(DataError);
  });

  it('gives a failure while reading again to onError, and goes on', async () => {
    const { books, store, environment } = await boot();
    const seen = watch(books, { source: 'book' });
    await waitFor(() => seen.pages.length === 1, 'the first page');
    environment.db.close();
    store.access.changes.notify(new Set(['e_book']));
    await waitFor(() => seen.errors.length === 1, 'the error');
    expect(seen.errors).toEqual(['STORAGE_UNAVAILABLE']);
    seen.stop();
  });
});
