import { configDefaults, defineConfig } from 'vitest/config';

// Gate tests spawn the real eslint, depcruise and vitest CLIs: allow for slow, loaded machines.
// The E2E gate launches a browser and starves under the parallel load of the unit-test phase, so it
// is excluded here and run on its own by `pnpm test:gates-e2e` (vitest.e2e.config.ts).
export default defineConfig({
  test: {
    testTimeout: 60_000,
    exclude: [...configDefaults.exclude, '**/.tmp/**', '**/e2e-gate.test.ts'],
  },
});
