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
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const playwrightCli = resolve(repoRoot, 'node_modules/@playwright/test/cli.js');

// The labels the real specs expect, read as data: gate-tests may not import from apps (table 9.2).
const fr = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/studio/src/locales/fr.json'), 'utf8'),
) as Record<'studio.title' | 'studio.subtitle', string>;

type SpecResult = { title: string; ok: boolean };
type Suite = { specs?: { title: string; ok: boolean }[]; suites?: Suite[] };

const collect = (suite: Suite): SpecResult[] => [
  ...(suite.specs ?? []).map(({ title, ok }) => ({ title, ok })),
  ...(suite.suites ?? []).flatMap(collect),
];

const page = (title: string, subtitle: string, themed: boolean): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Studio</title>${
    themed ? '<style>:root{--acs-color-surface:#ffffff}body{background:#ffffff}</style>' : ''
  }</head><body><div id="root"><h1>${title}</h1><p>${subtitle}</p></div></body></html>`;

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

/** Runs the Studio specs on Chromium against `url` and returns pass/fail per spec title. */
function runStudioSpecs(url: string): Promise<SpecResult[]> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, 'test', '--project=chromium', '--grep', 'Studio skeleton', '--reporter=json'],
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

describe('e2e gate (REC-10)', () => {
  it('fails the theme specs when the page has the right labels but no design tokens', async () => {
    const url = await serve(page(fr['studio.title'], fr['studio.subtitle'], false));
    const results = await runStudioSpecs(url);
    expect(results).toHaveLength(4);
    expect(outcome(results, 'starts and shows')).toBe(true);
    expect(outcome(results, 'light tokens by default')).toBe(false);
    expect(outcome(results, 'system dark preference')).toBe(false);
  });

  it('fails the start spec when the page renders the wrong content', async () => {
    const url = await serve(page('Page quelconque', 'Contenu sans rapport', false));
    const results = await runStudioSpecs(url);
    expect(outcome(results, 'starts and shows')).toBe(false);
  });
});
