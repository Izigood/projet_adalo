import type { Page } from '@playwright/test';
import { minimalFixture } from '../packages/testing/src/index.js';
import type { FixtureFiles } from '../packages/testing/src/index.js';
import { RUNTIME_URL } from './targets.js';

/**
 * Serves a package at `/project/` of the Runtime, the place it reads from (ADR-0033), by
 * intercepting the requests: nothing of the fixtures is in the production build.
 */
export async function serveProject(
  page: Page,
  files: FixtureFiles = minimalFixture(),
): Promise<void> {
  await page.route(`${RUNTIME_URL}/project/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/project\//, '');
    if (Object.hasOwn(files, path)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(files[path]),
      });
    } else {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    }
  });
}
