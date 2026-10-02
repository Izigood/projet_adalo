import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scratchRoot = join(here, '.tmp');

export type GateRun = { readonly status: number | null; readonly output: string };

export type Fixture = Readonly<Record<string, string>>;

/** Writes fixture files in a scratch directory inside the repo (so node resolution works). */
export function withScratchProject<T>(files: Fixture, run: (dir: string) => T): T {
  mkdirSync(scratchRoot, { recursive: true });
  const dir = mkdtempSync(join(scratchRoot, 'case-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const target = join(dir, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type Violation = { readonly rule: string; readonly from: string; readonly to: string };

export type DepcruiseRun = {
  readonly status: number | null;
  readonly violations: readonly Violation[];
  readonly output: string;
};

/** Runs the real dependency-cruiser CLI (with the repo configuration unless told otherwise). */
export function runDepcruise(dir: string, configPath = REPO_DEPCRUISE_CONFIG): DepcruiseRun {
  // dependency-cruiser does not export its package.json: address its CLI in the root node_modules.
  const bin = resolve(here, '../../node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
  const cruise = (outputType: string) =>
    spawnSync(process.execPath, [bin, '.', '--config', configPath, '--output-type', outputType], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  // Exit status comes from the `err` reporter, the one `pnpm depcruise` uses (json always exits 0);
  // the rule names come from the json report.
  const gate = cruise('err');
  const jsonRun = cruise('json');
  const result = {
    status: gate.status,
    stdout: jsonRun.stdout,
    stderr: `${gate.stdout}${gate.stderr}`,
  };
  const output = `${result.stdout}\n${result.stderr}`;
  let violations: Violation[] = [];
  try {
    const report = JSON.parse(result.stdout) as {
      summary: { violations: { rule: { name: string }; from: string; to: string }[] };
    };
    violations = report.summary.violations.map((v) => ({
      rule: v.rule.name,
      from: v.from,
      to: v.to,
    }));
  } catch {
    // Not JSON: the run failed before producing a report; callers assert on status and output.
  }
  return { status: result.status, violations, output };
}

export const REPO_DEPCRUISE_CONFIG = resolve(here, '../../.dependency-cruiser.cjs');

/** Runs the real Vitest CLI with coverage on a fixture project. */
export function runVitestCoverage(dir: string): GateRun {
  const require = createRequire(import.meta.url);
  const vitestEntry = resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  const result = spawnSync(
    process.execPath,
    [vitestEntry, 'run', '--coverage', '--root', dir, '--config', join(dir, 'vitest.config.ts')],
    { encoding: 'utf8' },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}
