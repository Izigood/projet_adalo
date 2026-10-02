import { defineConfig } from 'vitest/config';
import { coverageOptions } from './vitest.coverage.js';

export default defineConfig({
  test: {
    projects: ['packages/*', 'tools/*'],
    coverage: coverageOptions(),
  },
});
