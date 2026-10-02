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

describe('coverage gate (REC-10)', () => {
  it('passes when the logic is fully exercised', () => {
    const result = run(project('domain', spreadLogic, all));
    expect(result.status, result.output).toBe(0);
  });

  it('fails the 80 % global threshold when lines are left untested', () => {
    const result = run(project('other', spreadLogic, one));
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/Coverage for lines .* does not meet global threshold \(80%\)/);
  });

  it('fails a logic package under 85 % branches even with every line covered', () => {
    const result = run(project('domain', compactLogic, one));
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(
      /Coverage for branches .* does not meet "packages\/domain\/src\/\*\*\/\*\.ts" threshold \(85%\)/,
    );
  });

  it('does not apply the branch threshold outside logic packages', () => {
    const result = run(project('other', compactLogic, one));
    expect(result.status, result.output).toBe(0);
  });
});
