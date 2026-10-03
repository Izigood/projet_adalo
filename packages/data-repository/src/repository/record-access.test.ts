import { isUuidV7, newId } from '@acs/domain';
import type { Draft, RecordEnvelope } from '@acs/domain';
import { completeFixture, schemaOf } from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { createRecordAccess, writeError } from './record-access.js';
import type { RecordAccess, RecordOperations } from './record-access.js';

type Row = RecordEnvelope & Record<string, unknown>;

const { entities, relations } = schemaOf(completeFixture());
const built = buildLayout([...entities], [...relations]);
if (!built.ok) throw new Error('the complete fixture has no layout');

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

/** A data base of its own, a clock that moves one second per call, and a known writer. */
async function setup(actor = 'ada', layout = built.ok ? built.value : (undefined as never)) {
  const result = await openEnvironment({
    projectKey: 'DEMO',
    environment: 'test',
    layout,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!result.ok) throw new Error(result.error.message);
  opened.push(result.value);
  let second = 0;
  const access: RecordAccess = createRecordAccess(result.value, {
    actor: () => actor,
    now: () => new Date(Date.UTC(2026, 9, 3, 12, 0, second++)),
  });
  const tickets = layout.entities.has('ticket') ? access.entity<Row>('ticket') : undefined;
  return { environment: result.value, access, tickets: tickets as RecordOperations<Row> };
}

const ticket = (extra: Record<string, unknown> = {}): Draft<Row> =>
  ({ title: 'Broken lamp', openedOn: '2026-10-01', ...extra }) as Draft<Row>;

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function failure(result: { ok: boolean; error?: unknown }): {
  code: string;
  details?: Record<string, unknown>;
  message: string;
} {
  if (result.ok) throw new Error('expected a failure');
  return result.error as { code: string; details?: Record<string, unknown>; message: string };
}

describe('save: the envelope (dossier 6.4)', () => {
  it('creates a record with an id (UUID v7), version 1, dates and writer', async () => {
    const { tickets } = await setup('ada');
    const saved = value(await tickets.save(ticket()));
    expect(isUuidV7(saved.id)).toBe(true);
    expect(saved).toMatchObject({
      _v: 1,
      _createdBy: 'ada',
      _updatedBy: 'ada',
      _createdAt: '2026-10-03T12:00:00.000Z',
      _updatedAt: '2026-10-03T12:00:00.000Z',
    });
    expect(await tickets.get(saved.id)).toEqual(saved);
  });

  it('fills the defaults, canonicalises a decimal, and keeps the derived keys to itself', async () => {
    const { tickets, environment } = await setup();
    const saved = value(await tickets.save(ticket({ cost: '12.5' })));
    expect(saved).toMatchObject({ priority: 3, status: 'open', urgent: false, cost: '12.50' });
    expect(Object.keys(saved).some((key) => key.startsWith('_k_'))).toBe(false);
    const raw = await environment.db.table('e_ticket').get(saved.id);
    expect(raw).toMatchObject({ _k_cost: expect.any(String), _k_urgent: 0 });
  });

  it('takes the id it is given, and refuses one that is not a UUID v7', async () => {
    const { tickets } = await setup();
    const id = newId();
    expect(value(await tickets.save(ticket({ id }))).id).toBe(id);
    const bad = failure(await tickets.save(ticket({ id: 'abc' })));
    expect(bad.code).toBe('CONSTRAINT_VIOLATION');
  });

  it('records who created it and who changed it last', async () => {
    const { environment } = await setup('ada');
    const bob = createRecordAccess(environment, { actor: () => 'bob' }).entity<Row>('ticket');
    const ada = createRecordAccess(environment, { actor: () => 'ada' }).entity<Row>('ticket');
    const created = value(await ada.save(ticket()));
    const changed = value(await bob.save({ ...ticket({ title: 'Edited' }), id: created.id }));
    expect(changed).toMatchObject({ _createdBy: 'ada', _updatedBy: 'bob' });
  });

  it('gives each record its own copy of a default that is an object', async () => {
    const doc = buildLayout(
      [
        {
          id: newId(),
          key: 'doc',
          label: 'Doc',
          kind: 'business',
          classification: 'public',
          fields: [
            {
              id: newId(),
              key: 'payload',
              label: 'Payload',
              type: 'json',
              required: false,
              default: { items: [] },
              classification: 'public',
            },
          ],
        } as never,
      ],
      [],
    );
    if (!doc.ok) throw new Error('layout');
    const { access } = await setup('ada', doc.value);
    const docs = access.entity<Row>('doc');
    const first = value(await docs.save({} as Draft<Row>));
    (first['payload'] as { items: number[] }).items.push(1);
    const second = value(await docs.save({} as Draft<Row>));
    expect(second['payload']).toEqual({ items: [] });
  });

  it('replaces the record on update: version up, creation kept, update moved', async () => {
    const { tickets } = await setup();
    const first = value(await tickets.save(ticket()));
    const second = value(await tickets.save({ ...ticket({ title: 'Fixed' }), id: first.id }));
    expect(second).toMatchObject({
      id: first.id,
      title: 'Fixed',
      _v: 2,
      _createdAt: first._createdAt,
      _createdBy: 'ada',
    });
    expect(second._updatedAt > first._updatedAt).toBe(true);
    expect(value(await tickets.save({ ...ticket(), id: first.id }))._v).toBe(3);
  });
});

describe('optimistic lock: VERSION_CONFLICT (dossier 7.7)', () => {
  it('refuses the writer who read an older version, and writes nothing', async () => {
    const { tickets } = await setup();
    const read = value(await tickets.save(ticket()));
    value(await tickets.save({ ...ticket({ title: 'Writer A' }), id: read.id }, read._v));
    const conflict = failure(
      await tickets.save({ ...ticket({ title: 'Writer B' }), id: read.id }, read._v),
    );
    expect(conflict.code).toBe('VERSION_CONFLICT');
    expect(conflict.details).toMatchObject({ expected: 1, found: 2 });
    expect((await tickets.get(read.id))?.['title']).toBe('Writer A');
  });

  it('accepts the current version', async () => {
    const { tickets } = await setup();
    const read = value(await tickets.save(ticket()));
    expect(value(await tickets.save({ ...ticket(), id: read.id }, 1))._v).toBe(2);
  });

  it('is a conflict to expect a version of a record that is not there', async () => {
    const { tickets } = await setup();
    expect(failure(await tickets.save({ ...ticket(), id: newId() }, 1)).code).toBe(
      'VERSION_CONFLICT',
    );
    expect(failure(await tickets.save(ticket(), 1)).code).toBe('VERSION_CONFLICT');
  });

  it('applies to delete as well', async () => {
    const { tickets } = await setup();
    const read = value(await tickets.save(ticket()));
    expect(failure(await tickets.delete(read.id, 5)).code).toBe('VERSION_CONFLICT');
    expect(await tickets.get(read.id)).not.toBeNull();
    expect((await tickets.delete(read.id, 1)).ok).toBe(true);
    expect(await tickets.get(read.id)).toBeNull();
  });
});

describe('constraints, checked in the repository (EF-DAT-03)', () => {
  it('names every violation at once and writes nothing', async () => {
    const { tickets, environment } = await setup();
    const error = failure(
      await tickets.save(ticket({ title: ' padded', priority: 9, colour: 'red', openedOn: null })),
    );
    expect(error.code).toBe('CONSTRAINT_VIOLATION');
    const violations = error.details?.['violations'] as { field: string; rule: string }[];
    expect(violations.map((v) => `${v.field}:${v.rule}`).sort()).toEqual([
      'colour:unknown',
      'openedOn:required',
      'priority:max',
      'title:pattern',
    ]);
    expect(await environment.db.table('e_ticket').count()).toBe(0);
  });

  it('requires an obligatory field that has no default, and does not let null take the default', async () => {
    const { tickets } = await setup();
    const missing = failure(await tickets.save({ openedOn: '2026-10-01' } as Draft<Row>));
    expect(missing.message).toContain('title');
    const cleared = failure(await tickets.save(ticket({ priority: null })));
    expect(cleared.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'priority', rule: 'required' }),
    ]);
  });

  it('leaves out an optional field that has no value', async () => {
    const { tickets, environment } = await setup();
    const saved = value(await tickets.save(ticket({ cost: null })));
    expect('cost' in saved).toBe(false);
    expect('_k_cost' in (await environment.db.table('e_ticket').get(saved.id))).toBe(false);
  });

  it('refuses a duplicate in a unique field, but not the record itself', async () => {
    const { access } = await setup();
    const catalog = access.entity<Row>('catalog');
    const first = value(await catalog.save({ code: 'A', label: 'one' } as Draft<Row>));
    const clash = failure(await catalog.save({ code: 'A', label: 'two' } as Draft<Row>));
    expect(clash.code).toBe('CONSTRAINT_VIOLATION');
    expect(clash.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'code', rule: 'unique' }),
    ]);
    expect(
      (await catalog.save({ id: first.id, code: 'A', label: 'renamed' } as Draft<Row>)).ok,
    ).toBe(true);
    expect((await catalog.save({ code: 'B', label: 'two' } as Draft<Row>)).ok).toBe(true);
  });

  it('maps a refusal of the data base itself to a constraint violation', () => {
    expect(writeError({ name: 'ConstraintError' }).code).toBe('CONSTRAINT_VIOLATION');
    expect(writeError(new DOMException('full', 'QuotaExceededError')).code).toBe('STORAGE_QUOTA');
    expect(writeError(new Error('x')).code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('delete', () => {
  it('removes the record, and is not an error when it is already gone', async () => {
    const { tickets } = await setup();
    const saved = value(await tickets.save(ticket()));
    expect((await tickets.delete(saved.id)).ok).toBe(true);
    expect(await tickets.get(saved.id)).toBeNull();
    expect((await tickets.delete(saved.id)).ok).toBe(true);
  });
});

describe('transaction (UnitOfWork)', () => {
  it('commits everything the work wrote', async () => {
    const { access, environment } = await setup();
    await access.transaction(async (uow) => {
      const people = uow.of<Row>('person');
      const owner = value(await people.save({ name: 'Ada' } as Draft<Row>));
      value(await uow.of<Row>('ticket').save(ticket({ owner: owner.id })));
    });
    expect(await environment.db.table('e_person').count()).toBe(1);
    expect(await environment.db.table('e_ticket').count()).toBe(1);
  });

  it('undoes everything when the work throws (all or nothing)', async () => {
    const { access, environment } = await setup();
    await expect(
      access.transaction(async (uow) => {
        value(await uow.of<Row>('ticket').save(ticket({ title: 'first' })));
        value(await uow.of<Row>('person').save({ name: 'Ada' } as Draft<Row>));
        const refused = await uow.of<Row>('ticket').save(ticket({ priority: 99 }));
        if (!refused.ok) throw new Error('the second ticket is refused: undo');
      }),
    ).rejects.toThrow('undo');
    expect(await environment.db.table('e_ticket').count()).toBe(0);
    expect(await environment.db.table('e_person').count()).toBe(0);
  });

  it('keeps what a write inside it did when the work ends normally', async () => {
    const { access, environment } = await setup();
    await access.transaction(async (uow) => {
      await uow.of<Row>('ticket').save(ticket({ title: 'one' }));
      await uow.of<Row>('ticket').save(ticket({ title: 'two' }));
    });
    expect(await environment.db.table('e_ticket').count()).toBe(2);
  });
});

describe('entity', () => {
  it('says so when the project has no such entity (a programming error)', async () => {
    const { access } = await setup();
    expect(() => access.entity('nothing')).toThrow(/no entity nothing/);
  });
});
