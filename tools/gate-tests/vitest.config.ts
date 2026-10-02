import { configDefaults, defineConfig } from 'vitest/config';

// Gate tests spawn the real eslint, depcruise and vitest CLIs: allow for slow, loaded machines.
// They run in their own phase (`pnpm test:gates`), apart from the unit tests, whose workers they
// starve (a nested Vitest per coverage control). The E2E gate launches a browser: it is excluded here
// and has a phase of its own, `pnpm test:gates-e2e` (vitest.e2e.config.ts).
export default defineConfig({
  test: {
    testTimeout: 60_000,
    exclude: [...configDefaults.exclude, '**/.tmp/**', '**/e2e-gate.test.ts'],
  },
});
