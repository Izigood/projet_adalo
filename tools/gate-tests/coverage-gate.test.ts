import { describe, expect, it } from 'vitest';
import { runVitestCoverage, withScratchProject } from './run-gate.js';
import type { Fixture } from './run-gate.js';

/**
 * REC-10: negative controls of the coverage gate. The real thresholds (vitest.coverage.ts) are
 * applied to fixture packages laid out like the monorepo; only the tests of the logic change.
 */
const sharedConfig = `
import { defineConfig } from 'vitest/config';
import { coverageOptions } from '${new URL('../../vitest.coverage.ts', import.meta.url).href}';
export default defineConfig({
  test: { include: ['packages/*/src/**/*.test.ts'], coverage: coverageOptions() },
});
`;

// One-line `if` statements: V8 reports every line as covered but leaves branches untested.
const compactLogic = `
export function classify(n: number): string {
  if (n < 0) return 'negative';
  if (n === 0) return 'zero';
  return 'positive';
}
`;

// Block statements: every untested branch is also an untested line.
const spreadLogic = `
export function classify(n: number): string {
  if (n < 0) {
    return 'negative';
  }
  if (n === 0) {
    return 'zero';
  }
  return 'positive';
}
`;

const exercise = (cases: readonly [number, string][]): string => `
import { expect, it } from 'vitest';
import { classify } from './logic.js';
it('classifies', () => {
${cases.map(([input, expected]) => `  expect(classify(${input})).toBe('${expected}');`).join('\n')}
});
`;

const all = exercise([
  [-1, 'negative'],
  [0, 'zero'],
  [1, 'positive'],
]);
const one = exercise([[1, 'positive']]);

const project = (pkg: string, logic: string, test: string): Fixture => ({
  'vitest.config.ts': sharedConfig,
  [`packages/${pkg}/src/logic.ts`]: logic,
  [`packages/${pkg}/src/logic.test.ts`]: test,
});

const run = (files: Fixture) => withScratchProject(files, runVitestCoverage);

// The four logic packages of dossier 9.4. Written out here on purpose: the control must not read
// the list it is supposed to check from vitest.coverage.ts.
const LOGIC_PACKAGES = ['domain', 'expression', 'policy', 'workflow-engine'] as const;

const threshold = (kind: 'lines' | 'branches', name: string, percent: number) =>
  new RegExp(
    `Coverage for ${kind} .* does not meet "packages/${name}/src/\\*\\*/\\*\\.ts" threshold \\(${percent}%\\)`,
  );

describe('coverage gate (REC-10)', () => {
  it('fails the 80 % global threshold when lines are left untested', () => {
    const result = run(project('other', spreadLogic, one));
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/Coverage for lines .* does not meet global threshold \(80%\)/);
  });

  it('does not apply the branch threshold outside logic packages', () => {
    const result = run(project('other', compactLogic, one));
    expect(result.status, result.output).toBe(0);
  });

  describe.each(LOGIC_PACKAGES)('logic package %s', (name) => {
    it('passes when fully exercised', () => {
      const result = run(project(name, spreadLogic, all));
      expect(result.status, result.output).toBe(0);
    });

    it('fails its own 90 % lines threshold when lines are left untested', () => {
      const result = run(project(name, spreadLogic, one));
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(threshold('lines', name, 90));
    });

    it('fails its own 85 % branches threshold even with every line covered', () => {
      const result = run(project(name, compactLogic, one));
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(threshold('branches', name, 85));
    });
  });
});
