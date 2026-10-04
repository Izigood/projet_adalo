import {
  buildLayout,
  createDataStore,
  openEnvironment,
  purgeEnvironment,
  runQuery,
} from '../../packages/data-repository/src/index.js';
import type { QueryPlan } from '../../packages/data-repository/src/index.js';
import {
  BENCH_ROWS,
  benchEntity,
  benchQueries,
  benchRow,
} from '../../packages/testing/src/bench.js';

/**
 * The page of the volume bench, bundled and served to the three browsers by the spec (see
 * `bundle.ts`): it fills a real IndexedDB with records through the Repository and runs the queries
 * of `packages/testing/src/bench.ts`, timing each one. It decides nothing: the spec judges.
 */
export type BenchOptions = {
  /** How many records to load (default: the 10 000 of the bench). */
  readonly rows?: number;
  /** False declares no index: the negative control. */
  readonly indexed?: boolean;
  /** Times each query is run (default 5). */
  readonly runs?: number;
  /** Only these queries, by name (default: all). */
  readonly queries?: readonly string[];
  /** Milliseconds added to what is timed: the negative control of the budget. */
  readonly delayMs?: number;
};

export type BenchQueryResult = {
  readonly name: string;
  readonly plan: QueryPlan;
  readonly examined: number;
  readonly items: number;
  readonly aggregates: Readonly<Record<string, unknown>> | undefined;
  /** The records that came back are the right ones (they satisfy the filter, in order). */
  readonly valid: boolean;
  /** One duration per run, in milliseconds; the first is the cold one. */
  readonly durations: readonly number[];
};

export type BenchResult = {
  readonly rows: number;
  readonly seedMs: number;
  readonly queries: readonly BenchQueryResult[];
};

declare global {
  interface Window {
    __bench: { run(options: BenchOptions): Promise<BenchResult> };
  }
}

const PROJECT = 'BENCH';
const CHUNK = 500;

async function run(options: BenchOptions): Promise<BenchResult> {
  const rows = options.rows ?? BENCH_ROWS;
  const runs = options.runs ?? 5;

  await purgeEnvironment(PROJECT, 'test');
  const layout = buildLayout([benchEntity({ indexed: options.indexed !== false })], []);
  if (!layout.ok) throw new Error(layout.error.message);
  const opened = await openEnvironment({
    projectKey: PROJECT,
    environment: 'test',
    layout: layout.value,
  });
  if (!opened.ok) throw new Error(`${opened.error.code}: ${opened.error.message}`);
  const environment = opened.value;
  const store = createDataStore(environment);

  try {
    const started = performance.now();
    for (let from = 0; from < rows; from += CHUNK) {
      await store.access.transaction(async (uow) => {
        for (let i = from; i < Math.min(from + CHUNK, rows); i += 1) {
          const saved = await uow.of('item').save(benchRow(i) as never);
          if (!saved.ok) throw new Error(`${saved.error.code}: ${saved.error.message}`);
        }
      });
    }
    const seedMs = performance.now() - started;

    const count = await runQuery(environment, {
      source: 'item',
      aggregate: [{ fn: 'count', as: 'n' }],
      page: { size: 1 },
    });
    if (!count.ok) throw new Error(count.error.message);
    const stored = Number(count.value.page.aggregates?.['n']);

    const queries: BenchQueryResult[] = [];
    for (const query of benchQueries(rows).filter(
      (item) => options.queries === undefined || options.queries.includes(item.name),
    )) {
      const durations: number[] = [];
      let last: Awaited<ReturnType<typeof runQuery>> | undefined;
      for (let n = 0; n < runs; n += 1) {
        const at = performance.now();
        last = await runQuery(environment, { source: 'item', ...query.spec });
        if (options.delayMs !== undefined) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        durations.push(performance.now() - at);
      }
      if (last === undefined || !last.ok) throw new Error(`${query.name}: the query failed`);
      queries.push({
        name: query.name,
        plan: last.value.plan,
        examined: last.value.examined,
        items: last.value.page.items.length,
        aggregates: last.value.page.aggregates,
        valid: query.valid(last.value.page.items),
        durations,
      });
    }
    return { rows: stored, seedMs, queries };
  } finally {
    environment.close();
    await purgeEnvironment(PROJECT, 'test');
  }
}

window.__bench = { run };
