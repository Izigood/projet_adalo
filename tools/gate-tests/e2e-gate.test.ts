import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * REC-10: negative controls of the E2E gate. The real Playwright specs run against fake servers
 * that are reachable (HTTP 200) but render the wrong thing; only a behavioural failure of the
 * page can make them fail, so a spec that merely checked "the server answers" would pass here.
 * The positive case is the real E2E suite itself (`pnpm test:e2e`).
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const playwrightCli = resolve(repoRoot, 'node_modules/@playwright/test/cli.js');

// The labels the real specs expect, read as data: gate-tests may not import from apps (table 9.2).
const labels = (app: 'studio' | 'runtime') =>
  JSON.parse(readFileSync(resolve(repoRoot, `apps/${app}/src/locales/fr.json`), 'utf8')) as Record<
    string,
    string
  >;
const studio = labels('studio');
// The title the Runtime shows for the minimal fixture, read as data from the E2E targets (it is
// pinned by the digest test of the fixtures).
const minimalTitle =
  /MINIMAL_TITLE = '([^']+)'/.exec(
    readFileSync(resolve(repoRoot, 'e2e/targets.ts'), 'utf8'),
  )?.[1] ?? '';

/**
 * `ok` is what Playwright says of a spec, and it says it of a spec that was skipped too (after a
 * failure in a serial group, nothing runs): `status` tells a spec that passed from one that did not run.
 */
type SpecResult = {
  title: string;
  ok: boolean;
  status: string | undefined;
  /** What the failing assertion said, without the colours of the terminal. */
  error: string;
};
type Suite = {
  specs?: {
    title: string;
    ok: boolean;
    tests?: { status: string; results?: { error?: { message?: string } }[] }[];
  }[];
  suites?: Suite[];
};

// eslint-disable-next-line no-control-regex -- the escape character of the colours Playwright writes
const colours = /\u001b\[[0-9;]*m/g;

const collect = (suite: Suite): SpecResult[] => [
  ...(suite.specs ?? []).map(({ title, ok, tests }) => ({
    title,
    ok,
    status: tests?.[0]?.status,
    error: (tests?.[0]?.results?.[0]?.error?.message ?? '').replace(colours, ''),
  })),
  ...(suite.suites ?? []).flatMap(collect),
];

/** A Studio-like page: plain markup, no design tokens. */
const studioPage = (title: string, subtitle: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Studio</title></head>` +
  `<body><div id="root"><h1>${title}</h1><p>${subtitle}</p></div></body></html>`;

/** A Runtime-like page: the labels live in the shadow root of <acs-runtime-root>, no tokens. */
const runtimePage = (title: string, subtitle: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Runtime</title></head><body>` +
  `<script>customElements.define('acs-runtime-root', class extends HTMLElement {` +
  `constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = ` +
  `'<h1>${title}</h1><p>${subtitle}</p>'; } });</script><acs-runtime-root></acs-runtime-root>` +
  `</body></html>`;

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

async function serve(html: string): Promise<string> {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>((ready) => server?.listen(0, '127.0.0.1', ready));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

/** Runs the specs of `suiteName` on WebKit against `url`; pass/fail per spec title. */
function runSpecs(
  suiteName: string,
  url: string,
  extraEnv: Record<string, string> = {},
  project = 'webkit',
): Promise<SpecResult[]> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [
        playwrightCli,
        'test',
        // The control only needs a page that makes the specs fail, which does not depend on the
        // engine. WebKit is used because it closes instantly, whereas Chromium and Firefox can take
        // tens of seconds to close on a loaded machine, and every failing spec restarts a browser.
        `--project=${project}`,
        '--grep',
        suiteName,
        '--reporter=json',
        // Failing on purpose: recording a trace for each failure only slows the control down.
        '--trace=off',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          E2E_EXTERNAL: '1',
          E2E_EXPECT_TIMEOUT: '2000',
          STUDIO_URL: url,
          RUNTIME_URL: url,
          ...extraEnv,
        },
      },
    );
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.on('error', fail);
    child.on('close', () => {
      try {
        const report = JSON.parse(stdout) as { suites: Suite[] };
        done(report.suites.flatMap(collect));
      } catch (error) {
        fail(new Error(`no JSON report from Playwright: ${String(error)}\n${stdout}`));
      }
    });
  });
}

const outcome = (results: SpecResult[], fragment: string): boolean | undefined =>
  results.find((r) => r.title.includes(fragment))?.ok;

/** 'expected' (it passed), 'unexpected' (it failed) or 'skipped' (it did not run). */
const status = (results: SpecResult[], fragment: string): string | undefined =>
  results.find((r) => r.title.includes(fragment))?.status;

describe.each([
  {
    suite: 'Studio skeleton',
    start: 'starts and shows',
    page: () => studioPage(studio['studio.title'] ?? '', studio['studio.subtitle'] ?? ''),
  },
  {
    suite: 'Runtime skeleton',
    start: 'starts and renders',
    page: () => runtimePage(minimalTitle, ''),
  },
])('e2e gate (REC-10): $suite', ({ suite, start, page }) => {
  it('fails every theme spec when the page has the right labels but no design tokens', async () => {
    const results = await runSpecs(suite, await serve(page()));
    expect(results).toHaveLength(4);
    expect(outcome(results, start)).toBe(true);
    expect(outcome(results, 'light tokens by default')).toBe(false);
    expect(outcome(results, 'system dark preference')).toBe(false);
    expect(outcome(results, 'data-theme="light" override')).toBe(false);
  });

  it('fails the start spec when the page renders the wrong content', async () => {
    const wrong = suite.startsWith('Studio')
      ? studioPage('Page quelconque', 'Contenu sans rapport')
      : runtimePage('Page quelconque', 'Contenu sans rapport');
    const results = await runSpecs(suite, await serve(wrong));
    expect(outcome(results, start)).toBe(false);
  });
});

describe('e2e gate (REC-10): Runtime shell', () => {
  it('fails every shell spec against a page that shows the title but ignores the project, the hash, the guards and the theme', async () => {
    const results = await runSpecs('Runtime shell', await serve(runtimePage(minimalTitle, '')));
    expect(results).toHaveLength(9);
    expect(results.filter((result) => result.ok).map((result) => result.title)).toEqual([]);
  }, 120_000);
});
/** The title of the responsive fixture, read as data like the one of the minimal fixture. */
const responsiveTitle =
  /RESPONSIVE_TITLE = '([^']+)'/.exec(
    readFileSync(resolve(repoRoot, 'e2e/targets.ts'), 'utf8'),
  )?.[1] ?? '';

/**
 * A page that has the right title, a grid and a menu, but never looks at the window: the grid has
 * four columns and the menu is a row whatever the width, and nothing listens to a resize.
 */
const windowBlindPage = (title: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fixe</title><style>` +
  `acs-structure-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}` +
  `acs-navigation-menu{display:flex;gap:16px}</style></head><body><main><h1>${title}</h1>` +
  `<acs-navigation-menu><a href="#/">Accueil</a><a href="#/o">Commandes</a></acs-navigation-menu>` +
  `<acs-structure-grid><acs-info-indicator>1</acs-info-indicator><acs-info-indicator>2</acs-info-indicator>` +
  `<acs-info-indicator>3</acs-info-indicator><acs-info-indicator>4</acs-info-indicator></acs-structure-grid>` +
  `</main></body></html>`;

describe('e2e gate (REC-10): Runtime responsive', () => {
  it('fails every responsive spec against a page that shows the title but ignores the project and the window', async () => {
    const results = await runSpecs(
      'Runtime responsive',
      await serve(runtimePage(responsiveTitle, '')),
    );
    expect(results).toHaveLength(17);
    expect(results.filter((result) => result.ok).map((result) => result.title)).toEqual([]);
  }, 120_000);

  it('fails exactly the breakpoint specs against a page that has the grid and the menu but ignores the window', async () => {
    const results = await runSpecs(
      'Runtime responsive',
      await serve(windowBlindPage(responsiveTitle)),
    );
    // What a page that never reads the width gets wrong: the columns below 1024 px, the menu on a
    // phone, and following a resize. What it gets right by accident (four columns at 1280 px, a row
    // of links) must still pass, or the specs would be failing for another reason.
    expect(outcome(results, 'lays the grid out in 1 column(s) at 360 px')).toBe(false);
    expect(outcome(results, 'lays the grid out in 2 column(s) at 768 px')).toBe(false);
    expect(outcome(results, 'lays the grid out in 4 column(s) at 1280 px')).toBe(true);
    expect(outcome(results, 'puts the menu in a column on a phone')).toBe(false);
    expect(outcome(results, 'follows the window while it is open')).toBe(false);
    expect(outcome(results, 'shows the line break of a text on two lines')).toBe(false);
  }, 120_000);
});

/** The title of the interactive fixture, read as data like the others. */
const interactiveTitle =
  /INTERACTIVE_TITLE = '([^']+)'/.exec(
    readFileSync(resolve(repoRoot, 'e2e/targets.ts'), 'utf8'),
  )?.[1] ?? '';

/**
 * A page that has everything the interaction specs look for before they start (the title, three
 * tabs, the buttons « Actions » and « Supprimer ») but no behaviour at all: nothing opens, nothing
 * moves, nothing is announced. Only a spec that really plays the components can fail on it.
 */
const staticInteractivePage = (title: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Statique</title></head><body><main>` +
  `<h1>${title}</h1>` +
  `<div role="tablist" aria-label="Fiche"><button role="tab" aria-selected="true">Résumé</button>` +
  `<button role="tab" aria-selected="false">Détail</button><button role="tab" aria-selected="false">Historique</button></div>` +
  `<button>Actions</button><button>Supprimer</button>` +
  `<button aria-expanded="true">Un</button><button aria-expanded="false">Deux</button><button aria-expanded="false">Trois</button>` +
  `</main></body></html>`;

describe('e2e gate (REC-10): Runtime interactions', () => {
  it('fails every interaction spec against a page that shows the title but ignores the project', async () => {
    const results = await runSpecs(
      'Runtime interactions',
      await serve(runtimePage(interactiveTitle, '')),
    );
    expect(results).toHaveLength(12);
    expect(results.filter((result) => result.ok).map((result) => result.title)).toEqual([]);
  }, 180_000);

  it('fails every interaction spec against a page that has all the right markup but no behaviour', async () => {
    const results = await runSpecs(
      'Runtime interactions',
      await serve(staticInteractivePage(interactiveTitle)),
    );
    expect(results).toHaveLength(12);
    expect(results.filter((result) => result.ok).map((result) => result.title)).toEqual([]);
  }, 180_000);
});

/**
 * The data bench (lot 4) loads its own page: nothing is served for it, so the control sabotages
 * the bench itself, through the switch the spec reads. The positive case is the real bench.
 */
describe('e2e gate (REC-10): data bench', () => {
  // Only the origin of the page is needed (the spec answers every request for it itself, and an
  // IndexedDB belongs to an origin): a server that is there, as for the other controls.

  it('fails the spec of the index when no index is declared, and still passes the query that needs none', async () => {
    const results = await runSpecs('Data bench', await serve('<!doctype html>'), {
      E2E_BENCH_SABOTAGE: 'no-index',
    });
    expect(status(results, 'equality on an indexed field, first page')).toBe('unexpected');
    // What a scan does right (it finds the record, it reads them all) must still pass, or the
    // spec would be failing for another reason than the missing index. It has to have run: a spec
    // that was skipped after a failure is not one that passed.
    expect(status(results, 'control: equality on a field with no index')).toBe('expected');
    expect(status(results, 'holds the records')).toBe('expected');
  }, 240_000);

  it('fails when the data base holds far fewer records than the bench says', async () => {
    const results = await runSpecs('Data bench', await serve('<!doctype html>'), {
      E2E_BENCH_SABOTAGE: 'few-rows',
    });
    // A bench on 100 records would meet every budget: only the count of records tells it apart.
    expect(status(results, 'holds the records')).toBe('unexpected');
  }, 240_000);

  it('fails the spec of a query on the clock alone, when what is timed takes too long', async () => {
    // The WebKit of the other controls does not hold the clock on Windows (see the spec): this one
    // runs on Chromium, where the 10 000 records and the budget of 100 ms are the real ones.
    const results = await runSpecs(
      'Data bench',
      await serve('<!doctype html>'),
      { E2E_BENCH_SABOTAGE: 'slow' },
      'chromium',
    );
    const query = 'equality on an indexed field, first page';
    expect(status(results, 'holds the records')).toBe('expected');
    expect(status(results, query)).toBe('unexpected');
    // It is the budget that fails, not the plan, the count or the records: those are right.
    const failure = results.find((result) => result.title.includes(query))?.error ?? '';
    expect(failure).toContain('toBeLessThan');
    expect(failure).not.toContain('toBe(');
  }, 300_000);
});

it('e2e gate: the titles of the fixtures were read from the E2E targets', () => {
  expect(minimalTitle).not.toBe('');
  expect(responsiveTitle).not.toBe('');
  expect(interactiveTitle).not.toBe('');
});
