import { completeFixture, entityOf, referenceTo, relationOf, schemaOf } from '@acs/testing';
import { describe, expect, it } from 'vitest';
import { buildLayout } from './layout.js';

function layoutOf(...args: Parameters<typeof buildLayout>) {
  const built = buildLayout(...args);
  if (!built.ok) throw new Error(JSON.stringify(built.error.details));
  return built.value;
}

function problems(...args: Parameters<typeof buildLayout>): string {
  const built = buildLayout(...args);
  return built.ok ? '' : JSON.stringify(built.error.details?.['problems']);
}

const schemaOfStore = (layout: ReturnType<typeof layoutOf>, name: string) =>
  layout.stores.find((store) => store.name === name)?.schema;

describe('relations of the complete fixture', () => {
  const { entities, relations } = schemaOf(completeFixture());
  const layout = layoutOf([...entities], [...relations]);

  it('finds the key of a 1-N relation in the reference field of the target', () => {
    const owner = layout.relations.find((relation) => relation.foreignKey !== undefined);
    expect(owner).toMatchObject({
      source: 'person',
      target: 'ticket',
      cardinality: '1-N',
      onDelete: 'setNull',
      foreignKey: 'owner',
    });
  });

  it('lists the fields that point at another record, with what happens on deletion', () => {
    expect(layout.foreignKeys).toEqual([
      expect.objectContaining({
        holder: 'ticket',
        field: 'labels',
        multi: true,
        target: 'catalog',
        onDelete: 'restrict',
      }),
      expect.objectContaining({
        holder: 'ticket',
        field: 'owner',
        multi: false,
        target: 'person',
        onDelete: 'setNull',
      }),
    ]);
  });

  it('indexes a dictionary multiple choice by its elements', () => {
    expect((schemaOfStore(layout, 'e_ticket') ?? '').split(', ')).toContain('*labels');
  });
});

describe('what a relation asks of the schema', () => {
  const customer = entityOf('customer', { name: { type: 'string' } });
  const profile = entityOf('profile', { owner: referenceTo(customer) });

  it('makes the key of a 1-1 relation unique', () => {
    const layout = layoutOf(
      [customer, profile],
      [relationOf(customer, profile, '1-1', 'restrict')],
    );
    expect((schemaOfStore(layout, 'e_profile') ?? '').split(', ')).toContain('&owner');
  });

  it('leaves a 1-N key non-unique, and a reference with no relation restricted', () => {
    const layout = layoutOf([customer, profile], [relationOf(customer, profile, '1-N', 'cascade')]);
    expect((schemaOfStore(layout, 'e_profile') ?? '').split(', ')).toContain('owner');
    const bare = layoutOf([customer, profile], []);
    expect(bare.foreignKeys).toEqual([
      expect.objectContaining({ field: 'owner', onDelete: 'restrict' }),
    ]);
    expect(bare.foreignKeys[0]?.relationId).toBeUndefined();
  });

  it('refuses a relation whose target has no reference field to the source, or two', () => {
    const orphan = entityOf('orphan', { name: { type: 'string' } });
    expect(
      problems([customer, orphan], [relationOf(customer, orphan, '1-N', 'restrict')]),
    ).toContain('needs exactly one reference field to customer, it has 0');
    const twice = entityOf('twice', { a: referenceTo(customer), b: referenceTo(customer) });
    expect(problems([customer, twice], [relationOf(customer, twice, '1-N', 'restrict')])).toContain(
      'it has 2',
    );
  });

  it('refuses setNull on a required key, and two relations on one field', () => {
    const required = entityOf('required', { owner: referenceTo(customer, { required: true }) });
    expect(
      problems([customer, required], [relationOf(customer, required, '1-N', 'setNull')]),
    ).toContain('setNull cannot empty required.owner');
    expect(
      problems(
        [customer, profile],
        [
          relationOf(customer, profile, '1-N', 'restrict', 'one'),
          relationOf(customer, profile, '1-N', 'cascade', 'two'),
        ],
      ),
    ).toContain('profile.owner: two relations use this field');
  });

  it('refuses a field that points at an entity that is not in the project', () => {
    const lost = entityOf('lost', { owner: referenceTo(customer) });
    expect(problems([lost], [])).toContain('lost.owner: points at an entity that does not exist');
  });

  it('makes a junction store for an N-N relation only', () => {
    const nn = relationOf(customer, profile, 'N-N', 'cascade');
    const layout = layoutOf([customer, profile], [nn]);
    expect(layout.relations[0]).toMatchObject({ junctionStore: `j_${nn.id}` });
    expect(schemaOfStore(layout, `j_${nn.id}`)).toBe(
      'id, sourceId, targetId, &[sourceId+targetId]',
    );
  });
});
