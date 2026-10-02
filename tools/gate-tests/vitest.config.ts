import { defineConfig } from 'vitest/config';

// Gate tests spawn the real eslint, depcruise and vitest CLIs: allow for slow, loaded machines.
export default defineConfig({
  test: { testTimeout: 60_000 },
});
