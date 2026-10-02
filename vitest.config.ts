import { defineConfig } from 'vitest/config';
import { coverageOptions } from './vitest.coverage.js';

export default defineConfig({
  test: {
    // The gate tests run their own tools (nested Vitest, ESLint, dependency-cruiser) and starve the
    // unit tests when both run at once: they have their own phase, `pnpm test:gates` (ADR-0025).
    projects: ['apps/*', 'packages/*', 'tools/*', '!tools/gate-tests'],
    coverage: coverageOptions(),
  },
});
