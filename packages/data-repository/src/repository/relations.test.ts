import { newId } from '@acs/domain';
import type { Draft, RecordEnvelope } from '@acs/domain';
import type { Entity, Relation } from '@acs/project-schema';
import {
  completeFixture,
  entityOf,
  referenceTo,
  relationOf,
  schemaOf,
  stableId,
} from '@acs/testing';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { openEnvironment } from '../storage/database.js';
import type { OpenEnvironment } from '../storage/database.js';
import { buildLayout } from '../storage/layout.js';
import { createRecordAccess } from './record-access.js';

type Row = RecordEnvelope & Record<string, unknown>;

const opened: OpenEnvironment[] = [];
afterEach(() => {
  for (const environment of opened.splice(0)) environment.close();
});

async function boot(entities: readonly Entity[], relations: readonly Relation[]) {
  const layout = buildLayout([...entities], [...relations]);
  if (!layout.ok) throw new Error(JSON.stringify(layout.error.details));
  const result = await openEnvironment({
    projectKey: 'DEMO',
    environment: 'test',
    layout: layout.value,
    source: { indexedDB: new IDBFactory(), IDBKeyRange },
  });
  if (!result.ok) throw new Error(result.error.message);
  opened.push(result.value);
  let second = 0;
  const access = createRecordAccess(result.value, {
    actor: () => 'ada',
    now: () => new Date(Date.UTC(2026, 9, 3, 12, 0, second++)),
  });
  return {
    environment: result.value,
    access,
    of: (key: string) => access.entity<Row>(key),
    count: (store: string) => result.value.db.table(store).count(),
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

type Failure = { code: string; message: string; details?: Record<string, unknown> };
function failure(result: { ok: boolean; error?: unknown }): Failure {
  if (result.ok) throw new Error('expected a failure');
  return result.error as Failure;
}

const draft = (fields: Record<string, unknown>) => fields as Draft<Row>;

describe('what a record points at must exist', () => {
  const { entities, relations } = schemaOf(completeFixture());
  const ticket = (extra: Record<string, unknown>) =>
    draft({ title: 'Lamp', openedOn: '2026-10-01', ...extra });

  it('refuses a reference to a record that is not there, and writes nothing', async () => {
    const { of, count } = await boot(entities, relations);
    const error = failure(await of('ticket').save(ticket({ owner: newId() })));
    expect(error.code).toBe('CONSTRAINT_VIOLATION');
    expect(error.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'owner', rule: 'reference' }),
    ]);
    expect(await count('e_ticket')).toBe(0);
    const person = value(await of('person').save(draft({ name: 'Ada' })));
    expect((await of('ticket').save(ticket({ owner: person.id }))).ok).toBe(true);
  });

  it('checks every element of a multiple choice over a dictionary', async () => {
    const { of } = await boot(entities, relations);
    const label = value(await of('catalog').save(draft({ code: 'A', label: 'one' })));
    expect((await of('ticket').save(ticket({ labels: [label.id] }))).ok).toBe(true);
    const error = failure(await of('ticket').save(ticket({ labels: [label.id, newId()] })));
    expect(error.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'labels', rule: 'reference' }),
    ]);
  });

  it('checks that the file of a file field exists in _files', async () => {
    const { of, environment } = await boot(entities, relations);
    const fileId = newId();
    await environment.db.table('_files').put({ id: fileId });
    expect((await of('ticket').save(ticket({ attachment: fileId }))).ok).toBe(true);
    const error = failure(await of('ticket').save(ticket({ attachment: newId() })));
    expect(error.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'attachment', message: 'no such file' }),
    ]);
  });
});

describe('onDelete on the complete fixture', () => {
  const { entities, relations } = schemaOf(completeFixture());
  const ticket = (extra: Record<string, unknown>) =>
    draft({ title: 'Lamp', openedOn: '2026-10-01', ...extra });
  const junction = (layout: OpenEnvironment) =>
    layout.layout.relations.find((relation) => relation.junctionStore !== undefined);

  it('setNull: the tickets of a deleted person stay, with no owner (EF-DAT-02)', async () => {
    const { of } = await boot(entities, relations);
    const person = value(await of('person').save(draft({ name: 'Ada' })));
    const first = value(await of('ticket').save(ticket({ owner: person.id })));
    expect((await of('person').delete(person.id)).ok).toBe(true);
    const after = await of('ticket').get(first.id);
    expect(after).not.toBeNull();
    expect('owner' in (after ?? {})).toBe(false);
    expect(after).toMatchObject({ _v: 2, _updatedBy: 'ada' });
    expect(String(after?._updatedAt) > String(first._updatedAt)).toBe(true);
  });

  it('restrict (the default): a used dictionary entry cannot be deleted, and the error lists who uses it', async () => {
    const { of } = await boot(entities, relations);
    const label = value(await of('catalog').save(draft({ code: 'A', label: 'one' })));
    const used = value(await of('ticket').save(ticket({ labels: [label.id] })));
    const blocked = failure(await of('catalog').delete(label.id));
    expect(blocked.code).toBe('REFERENCE_BLOCKED');
    expect(blocked.message).toContain('1 in ticket.labels');
    expect(blocked.details).toMatchObject({
      total: 1,
      dependents: [{ entity: 'ticket', id: used.id, field: 'labels' }],
    });
    expect(await of('catalog').get(label.id)).not.toBeNull();
    value(await of('ticket').save({ ...ticket({}), id: used.id }));
    expect((await of('catalog').delete(label.id)).ok).toBe(true);
  });

  it('cascade on an N-N relation removes the links only, whichever end is deleted', async () => {
    const { of, access, environment } = await boot(entities, relations);
    const id = junction(environment)?.id ?? '';
    const links = access.links(id);
    const t1 = value(await of('ticket').save(ticket({})));
    const t2 = value(await of('ticket').save(ticket({})));
    const label = value(await of('catalog').save(draft({ code: 'A', label: 'one' })));
    for (const t of [t1, t2]) value(await links.link(t.id, label.id));

    expect((await of('ticket').delete(t1.id)).ok).toBe(true);
    expect(await links.sourcesOf(label.id)).toEqual([t2.id]);
    expect(await of('catalog').get(label.id)).not.toBeNull();

    expect((await of('catalog').delete(label.id)).ok).toBe(true);
    expect(await links.targetsOf(t2.id)).toEqual([]);
    expect(await of('ticket').get(t2.id)).not.toBeNull();
  });
});

describe('onDelete on small projects', () => {
  const customer = entityOf('customer', { name: { type: 'string', required: true } });
  const order = entityOf('order', {
    customer: referenceTo(customer, { required: true }),
    label: { type: 'string' },
  });

  it('restrict: names every dependent, up to 50, and the total', async () => {
    const { of, count } = await boot(
      [customer, order],
      [relationOf(customer, order, '1-N', 'restrict')],
    );
    const owner = value(await of('customer').save(draft({ name: 'Acme' })));
    for (let n = 0; n < 53; n += 1) {
      value(await of('order').save(draft({ customer: owner.id })));
    }
    const blocked = failure(await of('customer').delete(owner.id));
    expect(blocked.code).toBe('REFERENCE_BLOCKED');
    expect(blocked.message).toContain('53 in order.customer');
    expect(blocked.details?.['total']).toBe(53);
    expect((blocked.details?.['dependents'] as unknown[]).length).toBe(50);
    expect(await count('e_order')).toBe(53);
    expect(await count('e_customer')).toBe(1);
  });

  it('cascade: follows the chain, and removes nothing when the version is stale', async () => {
    const line = entityOf('line', { order: referenceTo(order, { required: true }) });
    const { of, count } = await boot(
      [customer, order, line],
      [relationOf(customer, order, '1-N', 'cascade'), relationOf(order, line, '1-N', 'cascade')],
    );
    const owner = value(await of('customer').save(draft({ name: 'Acme' })));
    const first = value(await of('order').save(draft({ customer: owner.id })));
    value(await of('line').save(draft({ order: first.id })));
    value(await of('line').save(draft({ order: first.id })));

    expect(failure(await of('customer').delete(owner.id, 9)).code).toBe('VERSION_CONFLICT');
    expect([await count('e_customer'), await count('e_order'), await count('e_line')]).toEqual([
      1, 1, 2,
    ]);
    expect((await of('customer').delete(owner.id, owner._v)).ok).toBe(true);
    expect([await count('e_customer'), await count('e_order'), await count('e_line')]).toEqual([
      0, 0, 0,
    ]);
  });

  it('a dependent that is going away anyway does not block', async () => {
    const note = entityOf('note', {
      customer: referenceTo(customer, { required: true }),
      order: referenceTo(order),
    });
    const { of, count } = await boot(
      [customer, order, note],
      [relationOf(customer, order, '1-N', 'cascade'), relationOf(customer, note, '1-N', 'cascade')],
    );
    const owner = value(await of('customer').save(draft({ name: 'Acme' })));
    const first = value(await of('order').save(draft({ customer: owner.id })));
    // `note.order` restricts the deletion of an order, but the note goes with its customer.
    value(await of('note').save(draft({ customer: owner.id, order: first.id })));
    expect((await of('customer').delete(owner.id)).ok).toBe(true);
    expect([await count('e_order'), await count('e_note')]).toEqual([0, 0]);
    // Whereas a note of another customer on that order does block it.
    const other = value(await of('customer').save(draft({ name: 'Other' })));
    const o2 = value(await of('order').save(draft({ customer: other.id })));
    const stranger = value(await of('customer').save(draft({ name: 'Third' })));
    value(await of('note').save(draft({ customer: stranger.id, order: o2.id })));
    expect(failure(await of('customer').delete(other.id)).code).toBe('REFERENCE_BLOCKED');
  });

  it('a dependent seen blocking, then removed by a deeper cascade, no longer blocks', async () => {
    // Deleting `root` cascades to `a`, and from `a` to `b`, and from `b` to `n`. But `n` also
    // restricts the deletion of `a`, and is met first: it must not be left standing as a blocker.
    const root = entityOf('root', { name: { type: 'string' } });
    const a = entityOf('a', { root: referenceTo(root, { required: true }) });
    const b = entityOf('b', { a: referenceTo(a, { required: true }) });
    const n = entityOf('n', {
      a: referenceTo(a, { required: true }),
      b: referenceTo(b, { required: true }),
    });
    // The order of the entities decides which key is met first: `n` is declared before `b`.
    const { of, count } = await boot(
      [root, a, n, b],
      [
        relationOf(root, a, '1-N', 'cascade'),
        relationOf(a, b, '1-N', 'cascade'),
        relationOf(b, n, '1-N', 'cascade'),
      ],
    );
    const r = value(await of('root').save(draft({ name: 'r' })));
    const ra = value(await of('a').save(draft({ root: r.id })));
    const rb = value(await of('b').save(draft({ a: ra.id })));
    value(await of('n').save(draft({ a: ra.id, b: rb.id })));
    expect((await of('root').delete(r.id)).ok).toBe(true);
    expect([await count('e_a'), await count('e_b'), await count('e_n')]).toEqual([0, 0, 0]);
  });

  it('the links of two records that go together go with them, even under restrict', async () => {
    const owner = entityOf('owner', { name: { type: 'string' } });
    const post = entityOf('post', { owner: referenceTo(owner, { required: true }) });
    const tag = entityOf('tag', { owner: referenceTo(owner, { required: true }) });
    const nn = relationOf(post, tag, 'N-N', 'restrict');
    const { of, access, count } = await boot(
      [owner, post, tag],
      [relationOf(owner, post, '1-N', 'cascade'), relationOf(owner, tag, '1-N', 'cascade'), nn],
    );
    const o = value(await of('owner').save(draft({ name: 'o' })));
    const p = value(await of('post').save(draft({ owner: o.id })));
    const t = value(await of('tag').save(draft({ owner: o.id })));
    value(await access.links(nn.id).link(p.id, t.id));
    expect((await of('owner').delete(o.id)).ok).toBe(true);
    expect([await count('e_post'), await count('e_tag'), await count(`j_${nn.id}`)]).toEqual([
      0, 0, 0,
    ]);
  });

  it('1-1: a second record cannot point at the same one', async () => {
    const profile = entityOf('profile', { owner: referenceTo(customer, { required: true }) });
    const { of } = await boot(
      [customer, profile],
      [relationOf(customer, profile, '1-1', 'cascade')],
    );
    const owner = value(await of('customer').save(draft({ name: 'Acme' })));
    value(await of('profile').save(draft({ owner: owner.id })));
    const second = failure(await of('profile').save(draft({ owner: owner.id })));
    expect(second.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'owner', rule: 'unique' }),
    ]);
  });

  it('a record that points at its own entity: a tree cascades, and a bare reference restricts', async () => {
    // An entity that points at itself: its own (stable) id is known before it is built.
    const self = stableId<'entity'>('builder.entity.category');
    const withTarget = entityOf('category', {
      parent: { type: 'reference', options: { target: self } },
    });
    const tree = await boot([withTarget], [relationOf(withTarget, withTarget, '1-N', 'cascade')]);
    const root = value(await tree.of('category').save(draft({})));
    const child = value(await tree.of('category').save(draft({ parent: root.id })));
    value(await tree.of('category').save(draft({ parent: child.id })));
    expect((await tree.of('category').delete(root.id)).ok).toBe(true);
    expect(await tree.count('e_category')).toBe(0);

    const bare = await boot([withTarget], []);
    const top = value(await bare.of('category').save(draft({})));
    value(await bare.of('category').save(draft({ parent: top.id })));
    expect(failure(await bare.of('category').delete(top.id)).code).toBe('REFERENCE_BLOCKED');
  });

  it('N-N restrict blocks while there are links, and names the other end', async () => {
    const tag = entityOf('tag', { name: { type: 'string' } });
    const post = entityOf('post', { title: { type: 'string' } });
    const nn = relationOf(post, tag, 'N-N', 'restrict');
    const { of, access } = await boot([post, tag], [nn]);
    const p = value(await of('post').save(draft({ title: 'x' })));
    const t = value(await of('tag').save(draft({ name: 'y' })));
    value(await access.links(nn.id).link(p.id, t.id));
    for (const [store, record] of [
      ['post', p],
      ['tag', t],
    ] as const) {
      const blocked = failure(await of(store).delete(record.id));
      expect(blocked.code).toBe('REFERENCE_BLOCKED');
      expect(blocked.details?.['dependents']).toEqual([
        expect.objectContaining({ field: `relation ${nn.id}` }),
      ]);
    }
    value(await access.links(nn.id).unlink(p.id, t.id));
    expect((await of('post').delete(p.id)).ok).toBe(true);
  });

  it('N-N setNull removes the links like cascade, and keeps the records', async () => {
    const tag = entityOf('tag', { name: { type: 'string' } });
    const post = entityOf('post', { title: { type: 'string' } });
    const nn = relationOf(post, tag, 'N-N', 'setNull');
    const { of, access } = await boot([post, tag], [nn]);
    const p = value(await of('post').save(draft({ title: 'x' })));
    const t = value(await of('tag').save(draft({ name: 'y' })));
    value(await access.links(nn.id).link(p.id, t.id));
    expect((await of('post').delete(p.id)).ok).toBe(true);
    expect(await access.links(nn.id).sourcesOf(t.id)).toEqual([]);
    expect(await of('tag').get(t.id)).not.toBeNull();
  });
});

describe('the links of an N-N relation', () => {
  const tag = entityOf('tag', { name: { type: 'string' } });
  const post = entityOf('post', { title: { type: 'string' } });
  const nn = relationOf(post, tag, 'N-N', 'cascade');

  it('links once, refuses an end that does not exist, and unlinks', async () => {
    const { of, access, count } = await boot([post, tag], [nn]);
    const links = access.links(nn.id);
    const p = value(await of('post').save(draft({ title: 'x' })));
    const t = value(await of('tag').save(draft({ name: 'y' })));
    value(await links.link(p.id, t.id));
    value(await links.link(p.id, t.id));
    expect(await count(`j_${nn.id}`)).toBe(1);
    expect(await links.targetsOf(p.id)).toEqual([t.id]);

    const missing = failure(await links.link(p.id, newId()));
    expect(missing.code).toBe('CONSTRAINT_VIOLATION');
    expect(missing.details?.['violations']).toEqual([
      expect.objectContaining({ field: 'targetId', rule: 'reference' }),
    ]);
    value(await links.unlink(p.id, t.id));
    value(await links.unlink(p.id, t.id));
    expect(await count(`j_${nn.id}`)).toBe(0);
  });

  it('says so when the relation is not an N-N relation of the project', async () => {
    const { access } = await boot([post, tag], [nn]);
    expect(() => access.links('nothing')).toThrow(/not an N-N relation/);
  });
});

describe('inside a transaction (UnitOfWork)', () => {
  const { entities, relations } = schemaOf(completeFixture());
  const ticket = (extra: Record<string, unknown>) =>
    draft({ title: 'Lamp', openedOn: '2026-10-01', ...extra });

  it('a save with nothing to look up still works when it is the first thing the transaction does', async () => {
    const { access, count } = await boot(entities, relations);
    await access.transaction(async (uow) => {
      value(await uow.of<Row>('ticket').save(ticket({})));
    });
    expect(await count('e_ticket')).toBe(1);
  });

  it('writes, deletes with a cascade and links, all or nothing', async () => {
    const { access, count } = await boot(entities, relations);
    await expect(
      access.transaction(async (uow) => {
        const person = value(await uow.of<Row>('person').save(draft({ name: 'Ada' })));
        value(await uow.of<Row>('ticket').save(ticket({ owner: person.id })));
        value(await uow.of<Row>('person').delete(person.id));
        throw new Error('undo it all');
      }),
    ).rejects.toThrow('undo it all');
    expect([await count('e_person'), await count('e_ticket')]).toEqual([0, 0]);

    await access.transaction(async (uow) => {
      const person = value(await uow.of<Row>('person').save(draft({ name: 'Ada' })));
      value(await uow.of<Row>('ticket').save(ticket({ owner: person.id })));
      value(await uow.of<Row>('person').delete(person.id));
    });
    expect([await count('e_person'), await count('e_ticket')]).toEqual([0, 1]);
  });
});
