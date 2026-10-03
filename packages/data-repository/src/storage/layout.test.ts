import type { Entity, Relation } from '@acs/project-schema';
import { completeFixture, schemaOf } from '@acs/testing';
import { describe, expect, it } from 'vitest';
import { buildLayout, deriveKeys, entityStoreName, junctionStoreName } from './layout.js';
import type { DataLayout } from './layout.js';

const ID = (n: number) => `0192f1c4-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** An entity with the given fields (type and options only matter); the rest is filled in. */
function entity(
  key: string,
  fields: Record<string, { type: string; options?: object; unique?: boolean }>,
  indexes: Entity['indexes'] = [],
  n = 1,
): Entity {
  return {
    id: ID(n),
    key,
    label: key,
    kind: 'business',
    classification: 'interne',
    fields: Object.entries(fields).map(([fieldKey, spec], position) => ({
      id: ID(100 * n + position),
      key: fieldKey,
      label: fieldKey,
      required: false,
      classification: 'public',
      ...spec,
    })),
    indexes,
  } as Entity;
}

function layoutOf(entities: Entity[], relations: Relation[] = []): DataLayout {
  const built = buildLayout(entities, relations);
  if (!built.ok) throw new Error(JSON.stringify(built.error.details));
  return built.value;
}

function problemsOf(entities: Entity[], relations: Relation[] = []): string[] {
  const built = buildLayout(entities, relations);
  if (built.ok) return [];
  expect(built.error.code).toBe('MANIFEST_INVALID');
  return (built.error.details?.['problems'] ?? []) as string[];
}

const schemaOfStore = (layout: DataLayout, name: string): string | undefined =>
  layout.stores.find((store) => store.name === name)?.schema;

describe('buildLayout on the complete fixture', () => {
  const { entities, relations } = schemaOf(completeFixture());
  const layout = layoutOf([...entities], [...relations]);
  const storeNames = layout.stores.map((store) => store.name);

  it('makes a store per entity, a junction per N-N relation, and the fixed stores', () => {
    const nn = relations.filter((relation) => relation.cardinality === 'N-N');
    expect(nn).toHaveLength(1);
    expect(storeNames).toEqual(
      expect.arrayContaining([
        'e_catalog',
        'e_person',
        'e_ticket',
        junctionStoreName(nn[0]?.id ?? ''),
        '_meta',
        '_files',
        '_wfRuns',
        '_wfLogs',
        '_outbox',
      ]),
    );
    expect(storeNames.filter((name) => name.startsWith('j_'))).toHaveLength(1);
    expect(entityStoreName('ticket')).toBe('e_ticket');
  });

  it('indexes unique fields, references and the declared indexes', () => {
    expect(schemaOfStore(layout, 'e_catalog')).toBe('id, _updatedAt, &code');
    const ticket = schemaOfStore(layout, 'e_ticket') ?? '';
    for (const wanted of ['owner', 'status', '[owner+openedOn]']) {
      expect(ticket.split(', ')).toContain(wanted);
    }
    expect(ticket.split(', ')).not.toContain('title');
  });

  it('keeps the classification of entities and fields (D-10)', () => {
    expect(layout.entities.get('person')?.classification).toBe('sensible');
    expect(layout.entities.get('person')?.fields.get('name')?.classification).toBe('sensible');
    expect(layout.entities.get('ticket')?.fields.get('owner')?.classification).toBe('sensible');
  });

  it('gives the same signature whatever the order, and another when an index changes', () => {
    const reversed = layoutOf([...entities].reverse(), [...relations].reverse());
    expect(reversed.signature).toBe(layout.signature);
    const changed = entities.map((item) =>
      item.key === 'ticket'
        ? { ...item, indexes: [...(item.indexes ?? []), { name: 'byTitle', fields: ['title'] }] }
        : item,
    );
    expect(layoutOf(changed, [...relations]).signature).not.toBe(layout.signature);
  });
});

describe('what is indexed, and how', () => {
  it('indexes a decimal and a boolean through a derived key', () => {
    const layout = layoutOf([
      entity(
        'item',
        {
          amount: { type: 'decimal', options: { precision: 8, scale: 2 }, unique: true },
          cost: { type: 'decimal', options: { precision: 8, scale: 2 } },
          done: { type: 'boolean' },
        },
        [
          { name: 'byCost', fields: ['cost'] },
          { name: 'byDone', fields: ['done', 'cost'] },
        ],
      ),
    ]);
    expect(schemaOfStore(layout, 'e_item')).toBe(
      'id, _updatedAt, &_k_amount, _k_cost, [_k_done+_k_cost]',
    );
  });

  it('indexes a multiple choice by its elements, alone', () => {
    const layout = layoutOf([
      entity('item', { tags: { type: 'multiChoice', options: {} } }, [
        { name: 'byTag', fields: ['tags'] },
      ]),
    ]);
    expect(schemaOfStore(layout, 'e_item')).toBe('id, _updatedAt, *tags');
  });

  it('merges a declared index with the unique one on the same field', () => {
    const layout = layoutOf([
      entity('item', { code: { type: 'string', unique: true } }, [
        { name: 'byCode', fields: ['code'] },
      ]),
    ]);
    expect(schemaOfStore(layout, 'e_item')).toBe('id, _updatedAt, &code');
  });
});

describe('a schema that cannot be stored', () => {
  it('names every problem at once', () => {
    const problems = problemsOf(
      [
        entity(
          'item',
          {
            id: { type: 'string' },
            extra: { type: 'json' },
            tags: { type: 'multiChoice', options: {} },
          },
          [
            { name: 'a', fields: ['missing'] },
            { name: 'b', fields: ['extra'] },
            { name: 'c', fields: ['tags', 'id'] },
          ],
        ),
        entity('item', { x: { type: 'string' } }, [], 2),
      ],
      [
        {
          id: ID(900),
          source: ID(1),
          target: ID(77),
          cardinality: 'N-N',
          onDelete: 'restrict',
        } as Relation,
      ],
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('id is the key of every record'),
        expect.stringContaining('does not exist'),
        expect.stringContaining('json field cannot be indexed'),
        expect.stringContaining('multiple choice can only be indexed alone'),
        expect.stringContaining('item: declared twice'),
        expect.stringContaining('links an entity that does not exist'),
      ]),
    );
  });

  it('refuses a unique multiple choice and a field declared twice', () => {
    expect(
      problemsOf([
        entity('item', { tags: { type: 'multiChoice', options: {}, unique: true } }),
      ]).join(),
    ).toContain('not as unique');
    const twice = entity('item', { a: { type: 'string' } });
    twice.fields.push(twice.fields[0] as never);
    expect(problemsOf([twice]).join()).toContain('item.a: declared twice');
  });
});

describe('deriveKeys', () => {
  const layout = layoutOf([
    entity('item', {
      cost: { type: 'decimal', options: { precision: 8, scale: 2 } },
      done: { type: 'boolean' },
      name: { type: 'string' },
    }),
  ]).entities.get('item');

  it('computes the sort key of a decimal and 0 or 1 for a boolean, and nothing for the rest', () => {
    if (layout === undefined) throw new Error('no layout');
    expect(deriveKeys(layout, { cost: '9.50', done: true, name: 'x' })).toEqual({
      _k_cost: '100000950',
      _k_done: 1,
    });
    expect(deriveKeys(layout, { cost: '-9.50', done: false })).toEqual({
      _k_cost: '099999049',
      _k_done: 0,
    });
  });

  it('leaves out an absent or null value, so that it is not in the index', () => {
    if (layout === undefined) throw new Error('no layout');
    expect(deriveKeys(layout, { cost: null, name: 'x' })).toEqual({});
    expect(deriveKeys(layout, {})).toEqual({});
  });
});
