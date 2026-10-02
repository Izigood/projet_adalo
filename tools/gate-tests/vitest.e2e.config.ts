import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['e2e-gate.test.ts'], testTimeout: 60_000 },
});
