import type { DomainError } from './errors.js';
import type { Id } from './id.js';
import type { Result } from './result.js';

/** A JSON value: what a record field or a filter value can hold. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Key of an entity (RG-11) and key of one of its fields: never a label. */
export type EntityKey = string;
export type FieldKey = string;

/** An expression in source form; evaluated by the expression engine, not by the Repository. */
export type ExpressionSource = string;

/** The five operators an index can serve (dossier 7.1). */
export const FILTER_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'startsWith'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const AGGREGATE_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;
/** Largest page a query can ask for (dossier 7.1). */
export const MAX_PAGE_SIZE = 500;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

export type FilterCondition = {
  readonly field: FieldKey;
  readonly op: FilterOperator;
  readonly value: JsonValue;
};

/** Structured filter `{ and: [{ field, op, value }] }`: it can use the indexes. */
export type FilterSpec = { readonly and: readonly FilterCondition[] };

export type QuerySpec = {
  readonly source: EntityKey;
  readonly filter?: FilterSpec;
  /** In-memory post-filter for what an index cannot serve; needs the expression engine (lot 8). */
  readonly where?: ExpressionSource;
  readonly search?: { readonly text: string; readonly fields: readonly FieldKey[] };
  readonly sort?: readonly { readonly field: FieldKey; readonly dir: SortDirection }[];
  readonly page?: { readonly size: number; readonly cursor?: string };
  readonly projection?: readonly FieldKey[];
  readonly aggregate?: readonly {
    readonly fn: AggregateFunction;
    readonly field?: FieldKey;
    readonly as: string;
  }[];
};

export type Page<T> = {
  readonly items: readonly T[];
  /** Opaque; pass it back as `page.cursor` to get the next page. Absent on the last page. */
  readonly nextCursor?: string;
  /** Present when the query asks for aggregates: one value per `as`. A decimal is a string. */
  readonly aggregates?: Readonly<Record<string, JsonValue>>;
};

/** What the Repository adds to every record (dossier 6.4); business fields follow by `key`. */
export type RecordEnvelope = {
  readonly id: Id;
  /** Row version, incremented at every write: the optimistic lock (`expectedVersion`). */
  readonly _v: number;
  readonly _createdAt: string;
  readonly _updatedAt: string;
  readonly _createdBy: string;
  readonly _updatedBy: string;
};

export type EnvelopeKey = keyof RecordEnvelope;

/** A record to write: without the fields the Repository owns. No `id` creates a new record. */
export type Draft<T extends RecordEnvelope> = Omit<T, EnvelopeKey> & {
  readonly id?: Id;
};

/**
 * Minimal reactive source: calls back with the current value, then at every change. A failure
 * while refreshing (the data base became unusable) is given to `onError`; the subscription goes on.
 */
export type Observable<T> = {
  subscribe(observer: (value: T) => void, onError?: (error: DomainError) => void): () => void;
};

/** The operations of one entity; inside a transaction these are all there is. */
export interface EntityOperations<T extends RecordEnvelope> {
  readonly entity: EntityKey;
  get(id: Id): Promise<T | null>;
  query(spec: QuerySpec): Promise<Page<T>>;
  save(input: Draft<T>, expectedVersion?: number): Promise<Result<T, DomainError>>;
  delete(id: Id, expectedVersion?: number): Promise<Result<void, DomainError>>;
}

/**
 * The entities seen from inside a transaction: all or nothing. The work given to `transaction`
 * must wait for nothing but these operations (an IndexedDB transaction ends as soon as the code
 * waits for anything else).
 */
export interface UnitOfWork {
  of<T extends RecordEnvelope>(entity: EntityKey): EntityOperations<T>;
}

/**
 * The port to the data of one application (dossier 7.1). It is bound to one entity: `get` and
 * `delete` take an id with no entity, so the entity has to come from somewhere (deviation noted in
 * ADR-0036); `query` refuses a `source` that is another entity.
 */
export interface Repository<T extends RecordEnvelope> extends EntityOperations<T> {
  transaction<R>(work: (uow: UnitOfWork) => Promise<R>): Promise<R>;
  observe(spec: QuerySpec): Observable<Page<T>>;
}

/** The entry point: one Repository per entity of the project. */
export interface DataStore {
  repository<T extends RecordEnvelope>(entity: EntityKey): Repository<T>;
}
