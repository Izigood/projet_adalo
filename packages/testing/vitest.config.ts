import { defineConfig } from 'vitest/config';

// Without a local config Vitest walks up to the root one, whose projects globs resolve from the
// wrong directory when the package is tested on its own. The fixtures are validated by the generated
// validators, so the same global setup as project-schema regenerates them first.
export default defineConfig({
  test: { globalSetup: ['../project-schema/scripts/global-setup.ts'] },
});
