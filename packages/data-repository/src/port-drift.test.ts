import { AGGREGATE_FUNCTIONS, FILTER_OPERATORS, MAX_PAGE_SIZE, SORT_DIRECTIONS } from '@acs/domain';
import type { Draft, QuerySpec, RecordEnvelope } from '@acs/domain';
import {
  AGGREGATE_FUNCTIONS as SCHEMA_AGGREGATE_FUNCTIONS,
  FILTER_OPERATORS as SCHEMA_FILTER_OPERATORS,
  SORT_DIRECTIONS as SCHEMA_SORT_DIRECTIONS,
  SCHEMAS,
} from '@acs/project-schema';
import type { Query } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';

/** The port lives in `domain`, which depends on nothing, so the manifest's shapes are copied there. */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

describe('the Repository port and the manifest agree', () => {
  it('lists the same filter operators, sort directions and aggregate functions', () => {
    expect(sameMembers(FILTER_OPERATORS, SCHEMA_FILTER_OPERATORS)).toBe(true);
    expect(sameMembers(SORT_DIRECTIONS, SCHEMA_SORT_DIRECTIONS)).toBe(true);
    expect(sameMembers(AGGREGATE_FUNCTIONS, SCHEMA_AGGREGATE_FUNCTIONS)).toBe(true);
  });

  it('the comparison notices a difference (negative control)', () => {
    expect(sameMembers(FILTER_OPERATORS, [...SCHEMA_FILTER_OPERATORS, 'like'])).toBe(false);
    expect(sameMembers(FILTER_OPERATORS, SCHEMA_FILTER_OPERATORS.slice(1))).toBe(false);
  });

  it('allows the same page size as the manifest', () => {
    const page = (SCHEMAS.Query.properties as Record<string, { properties?: unknown }>)['page'];
    const size = (page?.properties as Record<string, { maximum?: number }>)['size'];
    expect(size?.maximum).toBe(MAX_PAGE_SIZE);
  });

  it('a named query of the manifest is a valid QuerySpec (checked by the compiler)', () => {
    const toSpec = (query: Query): QuerySpec => query;
    const spec = toSpec({
      id: 'q' as Query['id'],
      key: 'open',
      source: 'ticket',
      filter: { and: [{ field: 'status', op: 'eq', value: 'open' }] },
      sort: [{ field: 'openedOn', dir: 'desc' }],
      page: { size: 50 },
      projection: ['title'],
      aggregate: [{ fn: 'count', as: 'n' }],
    });
    expect(spec.source).toBe('ticket');
  });

  it('a draft has no envelope fields but its id (checked by the compiler)', () => {
    type Ticket = RecordEnvelope & { title: string };
    const create: Draft<Ticket> = { title: 'x' };
    // @ts-expect-error the version belongs to the Repository
    const forged: Draft<Ticket> = { title: 'x', _v: 3 };
    expect(create.title).toBe(forged.title);
  });
});
