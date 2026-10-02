import type { CoverageOptions } from 'vitest/node';

/** Thresholds of dossier section 9.4: 90 % lines / 85 % branches on logic packages, 80 % overall. */
const LOGIC_PACKAGES = ['domain', 'expression', 'policy', 'workflow-engine'] as const;

export const GLOBAL_LINES_THRESHOLD = 80;

export function coverageOptions(): CoverageOptions {
  const logicThresholds = Object.fromEntries(
    LOGIC_PACKAGES.map((name) => [`packages/${name}/src/**/*.ts`, { lines: 90, branches: 85 }]),
  );
  return {
    provider: 'v8',
    include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts', 'tools/*/src/**/*.ts'],
    exclude: ['**/*.test.ts'],
    reporter: ['text-summary', 'lcov'],
    thresholds: { lines: GLOBAL_LINES_THRESHOLD, ...logicThresholds },
  };
}
