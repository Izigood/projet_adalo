import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withScratchProject } from './run-gate.js';
import type { Fixture } from './run-gate.js';

/**
 * Exit criterion of lot 0: "a forbidden dependency and an `eval` make the CI fail".
 *
 * `pnpm verify` chains its steps with `&&`, so one failing step fails it. Re-running verify from
 * inside a verify step would recurse, so this test executes the real `lint` and `depcruise`
 * commands, read from the repository package.json, with the real configuration files, on a
 * working copy where the violations are injected.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');

const manifest = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const verifySteps = (manifest.scripts['verify'] ?? '').split('&&').map((step) => step.trim());
const lintCommand = manifest.scripts['lint'] ?? '';
const depcruiseCommand = manifest.scripts['depcruise'] ?? '';

const entry = (name: string, source = ''): Fixture => ({
  [`packages/${name}/src/index.ts`]: `${source}export const name = '${name}';\n`,
});

const workspace = (extra: Fixture): Fixture => ({
  'package.json': read('package.json'),
  'eslint.config.js': read('eslint.config.js'),
  '.dependency-cruiser.cjs': read('.dependency-cruiser.cjs'),
  ...entry('domain'),
  ...entry('data-repository'),
  ...entry('components'),
  ...extra,
});

type CommandRun = { status: number | null; output: string };

function inWorkspace(files: Fixture, run: (exec: (command: string) => CommandRun) => void) {
  withScratchProject(workspace(files), (dir) => {
    const nodeModules = join(dir, 'node_modules');
    mkdirSync(dirname(nodeModules), { recursive: true });
    symlinkSync(resolve(repoRoot, 'node_modules'), nodeModules, 'junction');
    const binDir = join(nodeModules, '.bin');
    run((command) => {
      const result = spawnSync(command, {
        cwd: dir,
        shell: true,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDir}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH'] ?? ''}`,
        },
      });
      return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
    });
  });
}

describe('lot 0 exit criterion: forbidden code fails the CI chain', () => {
  it('pnpm verify runs the lint and depcruise steps, so a failure in either fails it', () => {
    expect(verifySteps).toContain('pnpm lint');
    expect(verifySteps).toContain('pnpm depcruise');
    expect(lintCommand).not.toBe('');
    expect(depcruiseCommand).not.toBe('');
  });

  it('baseline: a clean workspace passes both gates', () => {
    inWorkspace({}, (exec) => {
      expect(exec(lintCommand).status).toBe(0);
      expect(exec(depcruiseCommand).status).toBe(0);
    });
  });

  it('an eval in production code fails lint (and only lint)', () => {
    inWorkspace(
      { 'packages/domain/src/danger.ts': 'export const run = (code: string) => eval(code);\n' },
      (exec) => {
        const lint = exec(lintCommand);
        expect(lint.status).not.toBe(0);
        expect(lint.output).toContain('no-eval');
        expect(exec(depcruiseCommand).status).toBe(0);
      },
    );
  });

  it('a forbidden dependency fails depcruise (and only depcruise)', () => {
    inWorkspace(
      entry(
        'components',
        "import { name } from '../../data-repository/src/index.js';\nvoid name;\n",
      ),
      (exec) => {
        const depcruise = exec(depcruiseCommand);
        expect(depcruise.status).not.toBe(0);
        expect(depcruise.output).toContain('packages-components-allowed-deps');
        expect(exec(lintCommand).status).toBe(0);
      },
    );
  });
});
