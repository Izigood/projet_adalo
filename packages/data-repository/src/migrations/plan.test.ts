import type { DomainError } from '@acs/domain';
import type { Entity, Relation } from '@acs/project-schema';
import { entityOf, referenceTo, relationOf } from '@acs/testing';
import type { FieldSpec } from '@acs/testing';
import { describe, expect, it } from 'vitest';
import { planMigration } from './plan.js';
import type { MigrationPlan } from './plan.js';

type Fields = Record<string, FieldSpec>;

const FIELDS: Fields = {
  title: { type: 'string', required: true },
  qty: { type: 'integer' },
  price: { type: 'decimal', options: { precision: 8, scale: 2 } },
  note: { type: 'text' },
};
const INDEXES: NonNullable<Entity['indexes']> = [{ name: 'byQty', fields: ['qty'] }];

/** The fields without one of them. */
const without = (key: string): Fields =>
  Object.fromEntries(Object.entries(FIELDS).filter(([name]) => name !== key));

const ticket = (fields: Fields = FIELDS, indexes = INDEXES) => entityOf('ticket', fields, indexes);

function plan(
  from: Entity[],
  to: Entity[],
  relations: { from?: Relation[]; to?: Relation[] } = {},
): MigrationPlan {
  const result = planMigration(
    { entities: from, relations: relations.from ?? [] },
    { entities: to, relations: relations.to ?? [] },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error.details));
  return result.value;
}

function problems(
  from: Entity[],
  to: Entity[],
  relations: { from?: Relation[]; to?: Relation[] } = {},
): string[] {
  const result = planMigration(
    { entities: from, relations: relations.from ?? [] },
    { entities: to, relations: relations.to ?? [] },
  );
  if (result.ok) throw new Error('expected the plan to be refused');
  expect(
    result.error.code === 'MIGRATION_BLOCKED' || result.error.code === 'MANIFEST_INVALID',
  ).toBe(true);
  return (result.error as DomainError).details?.['problems'] as string[];
}

const kinds = (p: MigrationPlan) => p.steps.map((s) => s.op.kind);

describe('nothing changes', () => {
  it('is an empty plan, harmless and reversible, with the same signature', () => {
    const p = plan([ticket()], [ticket()]);
    expect(p.steps).toEqual([]);
    expect([p.destructive, p.reversible]).toEqual([false, true]);
    expect(p.fromSignature).toBe(p.toSignature);
  });
});

describe('entities', () => {
  it('adds an entity without risk, and removes one as a destructive step', () => {
    const tag = entityOf('tag', { name: { type: 'string' } });
    const add = plan([ticket()], [ticket(), tag]);
    expect(add.steps.map((s) => s.op)).toEqual([{ kind: 'addEntity', entity: 'tag' }]);
    expect([add.destructive, add.reversible]).toEqual([false, true]);

    const remove = plan([ticket(), tag], [ticket()]);
    expect(remove.steps.map((s) => s.op)).toEqual([{ kind: 'removeEntity', entity: 'tag' }]);
    expect([remove.destructive, remove.reversible]).toEqual([true, false]);
  });

  it('refuses to rename an entity: it would be a copy of its store', () => {
    const renamed = { ...ticket(), key: 'issue' } as Entity;
    expect(problems([ticket()], [renamed]).join()).toContain(
      'renaming an entity (to issue) is not supported',
    );
  });
});

describe('fields', () => {
  it('adds a field, with its default when it has one', () => {
    const more = ticket({ ...FIELDS, size: { type: 'integer', required: true, default: 3 } });
    expect(plan([ticket()], [more]).steps.map((s) => s.op)).toEqual([
      { kind: 'addField', entity: 'ticket', field: 'size', required: true, default: 3 },
    ]);
    const optional = ticket({ ...FIELDS, size: { type: 'integer' } });
    expect(plan([ticket()], [optional]).steps.map((s) => s.op)).toEqual([
      { kind: 'addField', entity: 'ticket', field: 'size', required: false },
    ]);
  });

  it('removes a field as a destructive step', () => {
    const p = plan([ticket()], [ticket(without('note'))]);
    expect(p.steps.map((s) => s.op)).toEqual([
      { kind: 'removeField', entity: 'ticket', field: 'note' },
    ]);
    expect([p.destructive, p.reversible]).toEqual([true, false]);
  });

  it('renames a field only when told: same id, other key; the index follows', () => {
    const from = ticket();
    const to = {
      ...from,
      fields: from.fields.map((f) => (f.key === 'qty' ? { ...f, key: 'quantity' } : f)),
      indexes: [{ name: 'byQty', fields: ['quantity'] }],
    } as Entity;
    const p = plan([from], [to]);
    expect(kinds(p)).toEqual(['renameField', 'removeIndex', 'addIndex']);
    expect(p.steps[0]?.op).toEqual({
      kind: 'renameField',
      entity: 'ticket',
      from: 'qty',
      to: 'quantity',
    });
    expect([p.destructive, p.reversible]).toEqual([false, true]);
    // Without the same id it is a removal and an addition: that is how a plain rename looks.
    const added = ticket({ ...without('qty'), quantity: { type: 'integer' } }, []);
    expect(kinds(plan([from], [added]))).toEqual(['removeField', 'addField', 'removeIndex']);
  });

  it('converts a field whose type changes, and says when it loses information', () => {
    const toText = ticket({ ...FIELDS, qty: { type: 'string' } });
    const p = plan([ticket()], [toText]);
    expect(kinds(p)).toContain('changeType');
    expect([p.destructive, p.reversible]).toEqual([false, true]);

    const day = (type: string) => ticket({ ...FIELDS, seen: { type } }, []);
    const lossy = plan([day('datetime')], [day('date')]);
    expect(lossy.steps.map((s) => s.op.kind)).toEqual(['changeType']);
    expect([lossy.destructive, lossy.reversible]).toEqual([true, false]);
  });

  it('converts a decimal whose precision or scale changes', () => {
    const wider = ticket({
      ...FIELDS,
      price: { type: 'decimal', options: { precision: 10, scale: 3 } },
    });
    expect(plan([ticket()], [wider]).steps.map((s) => s.op.kind)).toEqual(['changeType']);
  });

  it('refuses a type with no conversion, naming the field', () => {
    const extra = (type: string) => ticket({ ...FIELDS, extra: { type } }, []);
    expect(problems([extra('json')], [extra('string')]).join()).toContain(
      'ticket.extra: no conversion from json to string',
    );
  });

  it('makes a field required, with its default; making it optional needs nothing', () => {
    const required = ticket({ ...FIELDS, note: { type: 'text', required: true, default: 'n/a' } });
    expect(plan([ticket()], [required]).steps.map((s) => s.op)).toEqual([
      { kind: 'makeRequired', entity: 'ticket', field: 'note', default: 'n/a' },
    ]);
    expect(plan([required], [ticket()]).steps).toEqual([]);
  });
});

describe('indexes', () => {
  it('builds and drops them, and a unique one that stops being unique is rebuilt', () => {
    const more = ticket(FIELDS, [...INDEXES, { name: 'byTitle', fields: ['title'] }]);
    expect(plan([ticket()], [more]).steps.map((s) => s.op)).toEqual([
      { kind: 'addIndex', entity: 'ticket', index: 'title', unique: false },
    ]);
    expect(plan([more], [ticket()]).steps.map((s) => s.op)).toEqual([
      { kind: 'removeIndex', entity: 'ticket', index: 'title' },
    ]);
    const unique = ticket(FIELDS, [{ name: 'byQty', fields: ['qty'], unique: true }]);
    expect(kinds(plan([ticket()], [unique]))).toEqual(['removeIndex', 'addIndex']);
    expect(plan([ticket()], [unique]).steps[1]?.op).toMatchObject({ unique: true });
  });
});

describe('relations', () => {
  const customer = entityOf('customer', { name: { type: 'string' } });
  const order = entityOf('order', { customer: referenceTo(customer), label: { type: 'string' } });
  const tag = entityOf('tag', { name: { type: 'string' } });

  it('adds a relation, changes its onDelete, and removes it', () => {
    const cascade = relationOf(customer, order, '1-N', 'cascade');
    const restrict = relationOf(customer, order, '1-N', 'restrict');
    expect(
      plan([customer, order], [customer, order], { to: [cascade] }).steps.map((s) => s.op),
    ).toEqual([{ kind: 'addRelation', relation: cascade.id, cardinality: '1-N' }]);
    const alter = plan([customer, order], [customer, order], { from: [cascade], to: [restrict] });
    expect(alter.steps.map((s) => s.op)).toEqual([
      { kind: 'alterRelation', relation: cascade.id, onDelete: 'restrict' },
    ]);
    const drop = plan([customer, order], [customer, order], { from: [cascade] });
    expect([drop.destructive, drop.reversible]).toEqual([false, true]);
  });

  it('losing an N-N relation loses its links: destructive', () => {
    const nn = relationOf(customer, tag, 'N-N', 'cascade');
    const p = plan([customer, tag], [customer, tag], { from: [nn] });
    expect(p.steps.map((s) => s.op)).toEqual([
      { kind: 'removeRelation', relation: nn.id, cardinality: 'N-N' },
    ]);
    expect([p.destructive, p.reversible]).toEqual([true, false]);
  });

  it('refuses a relation whose ends or cardinality change', () => {
    const one = relationOf(customer, order, '1-N', 'cascade');
    const many = { ...one, cardinality: 'N-N' } as Relation;
    expect(
      problems([customer, order], [customer, order], { from: [one], to: [many] }).join(),
    ).toContain('cardinality or its ends changed');
  });
});

describe('the plan as a whole', () => {
  it('says every problem at once', () => {
    const renamed = { ...ticket(), key: 'issue' } as Entity;
    const extra = (type: string) => entityOf('thing', { extra: { type } }, []);
    const list = problems([ticket(), extra('json')], [renamed, extra('string')]);
    expect(list).toHaveLength(2);
  });

  it('is the same whatever the order of the schema, and has a fingerprint that tells plans apart', () => {
    const tag = entityOf('tag', { name: { type: 'string' } });
    const note = entityOf('note', { name: { type: 'string' } });
    const a = plan([ticket()], [ticket(), tag, note]);
    const b = plan([ticket()], [note, tag, ticket()]);
    expect(b.steps).toEqual(a.steps);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(plan([ticket()], [ticket(), tag]).fingerprint).not.toBe(a.fingerprint);
  });

  it('removes a field before another takes its key, converts before it adds', () => {
    const to = ticket({ ...without('note'), qty: { type: 'string' }, extra: { type: 'integer' } });
    const order = kinds(plan([ticket()], [to]));
    expect(order.indexOf('removeField')).toBeLessThan(order.indexOf('changeType'));
    expect(order.indexOf('changeType')).toBeLessThan(order.indexOf('addField'));
  });

  it('a field replaced by another of the same key is a removal then an addition', () => {
    const asText = ticket({ ...without('note'), note: { type: 'integer' } });
    // Same key, same id: that is a conversion. A different id is built by renaming the key first.
    expect(kinds(plan([ticket()], [asText]))).toEqual(['changeType']);
    const from = ticket();
    const swapped = {
      ...from,
      fields: [
        ...from.fields.filter((f) => f.key !== 'note'),
        { ...from.fields.find((f) => f.key === 'note'), id: from.id } as never,
      ],
    } as Entity;
    expect(kinds(plan([from], [swapped]))).toEqual(['removeField', 'addField']);
  });

  it('refuses a chain or a swap of renames, which cannot be applied one after the other', () => {
    const from = ticket();
    const swapped = {
      ...from,
      fields: from.fields.map((f) =>
        f.key === 'qty' ? { ...f, key: 'note' } : f.key === 'note' ? { ...f, key: 'qty' } : f,
      ),
      indexes: [],
    } as Entity;
    expect(problems([from], [swapped]).join()).toContain('a chain or a swap of renames');
  });

  it('passes on a target schema that cannot be stored', () => {
    const twice = ticket();
    twice.fields.push(twice.fields[0] as never);
    expect(problems([ticket()], [twice]).join()).toContain('declared twice');
  });
});
