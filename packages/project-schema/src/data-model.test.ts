import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import {
  AGGREGATE_FUNCTIONS,
  CARDINALITIES,
  ENTITY_KINDS,
  FILTER_OPERATORS,
  ON_DELETE_ACTIONS,
  SORT_DIRECTIONS,
  validate,
} from './index.js';
import type { Issue, SchemaName } from './index.js';

const without = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

function issuesOf(name: SchemaName, document: unknown): string[] {
  const result = validate(name, document);
  if (result.ok) return [];
  return (result.error.details as { issues: Issue[] }).issues.map(
    (issue) => `${issue.keyword} ${issue.path}`,
  );
}

const field = (key: string, extra: Record<string, unknown> = {}) => ({
  id: newId<'field'>(),
  key,
  label: key,
  type: 'string',
  required: false,
  classification: 'public',
  ...extra,
});

const entity = (extra: Record<string, unknown> = {}) => ({
  id: newId<'entity'>(),
  key: 'action',
  label: 'Action',
  kind: 'business',
  fields: [field('title', { required: true }), field('dueDate', { type: 'date' })],
  classification: 'interne',
  ...extra,
});

describe('entity', () => {
  it('accepts an entity of each kind, with and without indexes', () => {
    for (const kind of ENTITY_KINDS) expect(issuesOf('Entity', entity({ kind }))).toEqual([]);
    const indexed = entity({
      indexes: [
        { name: 'byDueDate', fields: ['dueDate'] },
        { name: 'uniqueTitle', fields: ['title'], unique: true },
      ],
    });
    expect(issuesOf('Entity', indexed)).toEqual([]);
  });

  it('needs at least one field', () => {
    expect(issuesOf('Entity', entity({ fields: [] }))).toEqual(['minItems /fields']);
  });

  it('reports a problem inside a field at the path of that field', () => {
    const broken = entity({ fields: [field('title'), field('Due-Date', { type: 'date' })] });
    expect(issuesOf('Entity', broken)).toEqual(['pattern /fields/1/key']);
    const unknownType = entity({ fields: [field('title'), field('x', { type: 'secret' })] });
    expect(issuesOf('Entity', unknownType)).toEqual(['discriminator /fields/1']);
    const missingOptions = entity({ fields: [field('amount', { type: 'decimal' })] });
    expect(issuesOf('Entity', missingOptions)).toEqual(['required /fields/0/options']);
  });

  it('refuses an unknown kind, a bad key, a bad id and an empty label', () => {
    expect(issuesOf('Entity', entity({ kind: 'table' }))).toEqual(['enum /kind']);
    expect(issuesOf('Entity', entity({ key: 'Action' }))).toEqual(['pattern /key']);
    expect(issuesOf('Entity', entity({ id: 'action' }))).toEqual(['pattern /id']);
    expect(issuesOf('Entity', entity({ label: '' }))).toEqual(['minLength /label']);
    expect(issuesOf('Entity', entity({ classification: 'secret' }))).toEqual([
      'enum /classification',
    ]);
  });

  it('requires id, key, label, kind, fields and classification', () => {
    for (const name of ['id', 'key', 'label', 'kind', 'fields', 'classification']) {
      expect(issuesOf('Entity', without(entity(), name))).toEqual([`required /${name}`]);
    }
  });

  it('refuses any other property (EF-SEC-04)', () => {
    expect(issuesOf('Entity', entity({ password: 'x' }))).toEqual([
      'additionalProperties /password',
    ]);
  });

  it('refuses a malformed index', () => {
    expect(issuesOf('Entity', entity({ indexes: [{ fields: ['title'] }] }))).toEqual([
      'required /indexes/0/name',
    ]);
    expect(issuesOf('Entity', entity({ indexes: [{ name: 'i', fields: [] }] }))).toEqual([
      'minItems /indexes/0/fields',
    ]);
    expect(issuesOf('Entity', entity({ indexes: [{ name: 'i', fields: ['Bad Key'] }] }))).toEqual([
      'pattern /indexes/0/fields/0',
    ]);
  });
});

describe('relation', () => {
  const relation = (extra: Record<string, unknown> = {}) => ({
    id: newId<'relation'>(),
    source: newId<'entity'>(),
    target: newId<'entity'>(),
    cardinality: '1-N',
    onDelete: 'restrict',
    ...extra,
  });

  it('accepts every cardinality and every onDelete action', () => {
    for (const cardinality of CARDINALITIES) {
      for (const onDelete of ON_DELETE_ACTIONS) {
        expect(issuesOf('Relation', relation({ cardinality, onDelete }))).toEqual([]);
      }
    }
  });

  it('designates entities by id and refuses labels or keys (never by label)', () => {
    expect(issuesOf('Relation', relation({ source: 'Action', target: 'owner' }))).toEqual([
      'pattern /source',
      'pattern /target',
    ]);
  });

  it('refuses an unknown cardinality or onDelete', () => {
    expect(issuesOf('Relation', relation({ cardinality: 'N-1' }))).toEqual(['enum /cardinality']);
    expect(issuesOf('Relation', relation({ onDelete: 'set null' }))).toEqual(['enum /onDelete']);
  });

  it('requires every attribute and refuses extra ones', () => {
    for (const name of ['id', 'source', 'target', 'cardinality', 'onDelete']) {
      expect(issuesOf('Relation', without(relation(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('Relation', relation({ label: 'x' }))).toEqual(['additionalProperties /label']);
  });
});

describe('query', () => {
  const query = (extra: Record<string, unknown> = {}) => ({
    id: newId<'query'>(),
    key: 'openActions',
    source: 'action',
    ...extra,
  });

  it('accepts a minimal query and a complete one', () => {
    expect(issuesOf('Query', query())).toEqual([]);
    const full = query({
      filter: { and: [{ field: 'status', op: 'eq', value: 'open' }] },
      where: 'dueDate < today()',
      sort: [{ field: 'dueDate', dir: 'asc' }],
      page: { size: 50, cursor: 'abc' },
      projection: ['title', 'dueDate'],
      aggregate: [
        { fn: 'count', as: 'total' },
        { fn: 'sum', field: 'amount', as: 'sumAmount' },
      ],
    });
    expect(issuesOf('Query', full)).toEqual([]);
  });

  it('accepts every operator, direction and aggregate function', () => {
    for (const op of FILTER_OPERATORS) {
      expect(issuesOf('Query', query({ filter: { and: [{ field: 'a', op, value: 1 }] } }))).toEqual(
        [],
      );
    }
    for (const dir of SORT_DIRECTIONS) {
      expect(issuesOf('Query', query({ sort: [{ field: 'a', dir }] }))).toEqual([]);
    }
    for (const fn of AGGREGATE_FUNCTIONS) {
      expect(issuesOf('Query', query({ aggregate: [{ fn, as: 'x' }] }))).toEqual([]);
    }
  });

  it('accepts null, objects and arrays as filter values, but a value must be present', () => {
    for (const value of [null, 0, false, '', ['a', 'b'], { from: 1 }]) {
      expect(
        issuesOf('Query', query({ filter: { and: [{ field: 'a', op: 'in', value }] } })),
      ).toEqual([]);
    }
    expect(issuesOf('Query', query({ filter: { and: [{ field: 'a', op: 'eq' }] } }))).toEqual([
      'required /filter/and/0/value',
    ]);
  });

  it('bounds the page size at 500 (dossier 7.1)', () => {
    expect(issuesOf('Query', query({ page: { size: 500 } }))).toEqual([]);
    expect(issuesOf('Query', query({ page: { size: 501 } }))).toEqual(['maximum /page/size']);
    expect(issuesOf('Query', query({ page: { size: 0 } }))).toEqual(['minimum /page/size']);
    expect(issuesOf('Query', query({ page: { size: 1.5 } }))).toEqual(['type /page/size']);
  });

  it('points at the part that is wrong', () => {
    expect(issuesOf('Query', query({ source: 'Action' }))).toEqual(['pattern /source']);
    expect(issuesOf('Query', query({ filter: { and: [] } }))).toEqual(['minItems /filter/and']);
    expect(
      issuesOf('Query', query({ filter: { and: [{ field: 'a', op: 'like', value: 'x' }] } })),
    ).toEqual(['enum /filter/and/0/op']);
    expect(issuesOf('Query', query({ sort: [{ field: 'a', dir: 'up' }] }))).toEqual([
      'enum /sort/0/dir',
    ]);
    expect(issuesOf('Query', query({ sort: [] }))).toEqual(['minItems /sort']);
    expect(issuesOf('Query', query({ where: '' }))).toEqual(['minLength /where']);
    expect(issuesOf('Query', query({ projection: ['Bad Key'] }))).toEqual([
      'pattern /projection/0',
    ]);
    expect(issuesOf('Query', query({ aggregate: [{ fn: 'median', as: 'm' }] }))).toEqual([
      'enum /aggregate/0/fn',
    ]);
    expect(issuesOf('Query', query({ aggregate: [{ fn: 'count' }] }))).toEqual([
      'required /aggregate/0/as',
    ]);
  });

  it('refuses a property it does not know, such as raw SQL', () => {
    expect(issuesOf('Query', query({ sql: 'select 1' }))).toEqual(['additionalProperties /sql']);
  });

  it('requires id, key and source', () => {
    for (const name of ['id', 'key', 'source']) {
      expect(issuesOf('Query', without(query(), name))).toEqual([`required /${name}`]);
    }
  });
});
