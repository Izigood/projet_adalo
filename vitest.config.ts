import { defineConfig } from 'vitest/config';
import { coverageOptions } from './vitest.coverage.js';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*', 'tools/*'],
    coverage: coverageOptions(),
  },
});
