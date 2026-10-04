import type { CoverageOptions } from 'vitest/node';

/** Thresholds of dossier section 9.4: 90 % lines / 85 % branches on logic packages, 80 % overall. */
const LOGIC_PACKAGES = ['domain', 'expression', 'policy', 'workflow-engine'] as const;

/**
 * Migrations are logic too: dossier 9.4 lists them with the packages held to the same 90 % / 85 %
 * thresholds. The manifest migrations live in project-schema and the data migrations (dossier 6.5)
 * in data-repository, neither of which is a logic package as a whole.
 */
const MIGRATION_FILES = [
  'packages/project-schema/src/migrations.ts',
  'packages/project-schema/src/migrations/**/*.ts',
  'packages/data-repository/src/migrations/**/*.ts',
] as const;

export const GLOBAL_LINES_THRESHOLD = 80;

export function coverageOptions(): CoverageOptions {
  const logicThresholds = Object.fromEntries(
    LOGIC_PACKAGES.map((name) => [`packages/${name}/src/**/*.ts`, { lines: 90, branches: 85 }]),
  );
  const migrationThresholds = Object.fromEntries(
    MIGRATION_FILES.map((glob) => [glob, { lines: 90, branches: 85 }]),
  );
  return {
    provider: 'v8',
    include: [
      'apps/*/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'tools/*/src/**/*.{ts,tsx}',
    ],
    exclude: ['**/*.test.{ts,tsx}'],
    reporter: ['text-summary', 'lcov'],
    thresholds: { lines: GLOBAL_LINES_THRESHOLD, ...logicThresholds, ...migrationThresholds },
  };
}
