import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withScratchProject } from './run-gate.js';

/**
 * REC-10: negative control of the browser matrix (decision D-11, lot 0: "Playwright 3 navigateurs").
 * Asks Playwright itself which projects will run each spec, then checks the three engines are all
 * there. The same check, applied to configurations with a browser removed, must report it.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const playwrightCli = resolve(repoRoot, 'node_modules/@playwright/test/cli.js');
const REQUIRED_BROWSERS = ['chromium', 'firefox', 'webkit'] as const;

type Suite = {
  specs?: { tests: { projectName: string }[] }[];
  suites?: Suite[];
};

const projectNames = (suite: Suite): string[] => [
  ...(suite.specs ?? []).flatMap((spec) => spec.tests.map((test) => test.projectName)),
  ...(suite.suites ?? []).flatMap(projectNames),
];

/** Number of tests Playwright schedules per project for `configPath`. */
function testsPerProject(configPath: string): Record<string, number> {
  const result = spawnSync(
    process.execPath,
    [playwrightCli, 'test', '--list', '--reporter=json', '--config', configPath],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, E2E_EXTERNAL: '1' } },
  );
  const report = JSON.parse(result.stdout) as { suites: Suite[] };
  const counts: Record<string, number> = {};
  for (const name of report.suites.flatMap(projectNames)) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

const missingBrowsers = (counts: Record<string, number>): string[] =>
  REQUIRED_BROWSERS.filter((browser) => (counts[browser] ?? 0) === 0);

const configWith = (browsers: Record<string, string>): string => `
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: ${JSON.stringify(join(repoRoot, 'e2e'))},
  projects: [${Object.entries(browsers)
    .map(([name, device]) => `{ name: '${name}', use: { ...devices['${device}'] } }`)
    .join(', ')}],
});
`;

const DEVICES = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
} as const;

describe('browser matrix (REC-10)', () => {
  it('the repository configuration runs every spec on Chromium, Firefox and WebKit', () => {
    const counts = testsPerProject(join(repoRoot, 'playwright.config.ts'));
    expect(missingBrowsers(counts)).toEqual([]);
    const chromium = counts['chromium'] ?? 0;
    expect(chromium).toBeGreaterThan(0);
    expect(counts['firefox']).toBe(chromium);
    expect(counts['webkit']).toBe(chromium);
  });

  it('the check reports a browser that is missing from the configuration (negative control)', () => {
    const withoutFirefox = Object.fromEntries(
      Object.entries(DEVICES).filter(([name]) => name !== 'firefox'),
    );
    const chromiumOnly = { chromium: DEVICES.chromium };
    withScratchProject(
      {
        'chromium-only.config.ts': configWith(chromiumOnly),
        'no-firefox.config.ts': configWith(withoutFirefox),
      },
      (dir) => {
        expect(missingBrowsers(testsPerProject(join(dir, 'chromium-only.config.ts')))).toEqual([
          'firefox',
          'webkit',
        ]);
        expect(missingBrowsers(testsPerProject(join(dir, 'no-firefox.config.ts')))).toEqual([
          'firefox',
        ]);
      },
    );
  });
});
