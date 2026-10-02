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

type SpecResult = { title: string; ok: boolean };
type Suite = { specs?: { title: string; ok: boolean }[]; suites?: Suite[] };

const collect = (suite: Suite): SpecResult[] => [
  ...(suite.specs ?? []).map(({ title, ok }) => ({ title, ok })),
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
function runSpecs(suiteName: string, url: string): Promise<SpecResult[]> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [
        playwrightCli,
        'test',
        // The control only needs a page that makes the specs fail, which does not depend on the
        // engine. WebKit is used because it closes instantly, whereas Chromium and Firefox can take
        // tens of seconds to close on a loaded machine, and every failing spec restarts a browser.
        '--project=webkit',
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

it('e2e gate: the title of the minimal fixture was read from the E2E targets', () => {
  expect(minimalTitle).not.toBe('');
});
