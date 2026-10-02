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
