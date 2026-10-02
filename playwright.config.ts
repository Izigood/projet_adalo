import { defineConfig, devices } from '@playwright/test';

/**
 * E2E on the browsers of decision D-11: Chromium, Firefox and WebKit.
 * The applications are served from their production build (`pnpm build` runs first in verify).
 * Set E2E_EXTERNAL=1 to target already-running servers (STUDIO_URL / RUNTIME_URL): used by the
 * negative control of the gate (tools/gate-tests).
 */
const external = process.env['E2E_EXTERNAL'] === '1';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  // Closing Chromium or Firefox sometimes takes 20 to 70 s on a loaded Windows machine (measured:
  // WebKit always closes in under a second). The per-test timeout includes that teardown, so the
  // 30 s default turned a slow close into a failure. Two workers keep the load down; retries would
  // hide real instability, so there are none.
  timeout: 120_000,
  workers: 2,
  // Negative controls (tools/gate-tests) shorten it: a failing assertion otherwise waits 5 s.
  expect: { timeout: Number(process.env['E2E_EXPECT_TIMEOUT'] ?? 5000) },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  ...(external
    ? {}
    : {
        webServer: [
          {
            command: 'pnpm --filter @acs/studio preview --host 127.0.0.1',
            url: 'http://127.0.0.1:4173',
            reuseExistingServer: false,
            timeout: 60_000,
          },
          {
            command: 'pnpm --filter @acs/runtime preview --host 127.0.0.1',
            url: 'http://127.0.0.1:4174',
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ],
      }),
});
