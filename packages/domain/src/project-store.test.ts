import { describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS, isPastTrashRetention } from './project-store.js';
import type { CatalogEntry } from './project-store.js';
import { newId } from './uuid-v7.js';

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: newId(),
  key: 'DEMO',
  name: 'Demo',
  description: '',
  author: 'Ada',
  version: '0.1.0',
  locale: 'fr-FR',
  status: 'trashed',
  revision: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

/** A project put in the trash on 1 October at noon. */
const trashed = (over: Partial<CatalogEntry> = {}): CatalogEntry =>
  entry({ trashedAt: '2026-10-01T12:00:00.000Z', ...over });

describe('trash retention (EF-PRJ-02)', () => {
  it('is 30 days', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it('keeps a project 29 days and 23 hours, and lets go of it at 30 days', () => {
    expect(isPastTrashRetention(trashed(), '2026-10-31T11:59:59.999Z')).toBe(false);
    expect(isPastTrashRetention(trashed(), '2026-10-31T12:00:00.000Z')).toBe(true);
  });

  it('never lets go of a project that is not in the trash', () => {
    const old = '2030-01-01T00:00:00.000Z';
    expect(isPastTrashRetention(trashed({ status: 'active' }), old)).toBe(false);
    expect(isPastTrashRetention(trashed({ status: 'archived' }), old)).toBe(false);
  });

  it('keeps a project in the trash that has no date or an unreadable one', () => {
    const old = '2030-01-01T00:00:00.000Z';
    expect(isPastTrashRetention(entry({}), old)).toBe(false);
    expect(isPastTrashRetention(trashed({ trashedAt: 'yesterday' }), old)).toBe(false);
    expect(isPastTrashRetention(trashed(), 'later')).toBe(false);
  });
});
