import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { RUNTIME_URL, MINIMAL_TITLE, SURFACE } from './targets.js';
import { serveProject } from './serve-fixture.js';

const surfaceToken = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--acs-color-surface').trim(),
  );

/** Background of the Lit shell: the tokens must cross the shadow boundary. */
const shellBackground = (page: Page) =>
  page.locator('acs-runtime-root').evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('Runtime skeleton', () => {
  test.beforeEach(async ({ page }) => {
    await serveProject(page);
  });

  test('starts and renders the page of the minimal project', async ({ page }) => {
    await page.goto(RUNTIME_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MINIMAL_TITLE);
  });

  test('applies the light tokens by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(RUNTIME_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MINIMAL_TITLE);
    expect(await surfaceToken(page)).toBe(SURFACE.light.token);
    expect(await shellBackground(page)).toBe(SURFACE.light.rgb);
  });

  test('follows the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(RUNTIME_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MINIMAL_TITLE);
    expect(await surfaceToken(page)).toBe(SURFACE.dark.token);
    expect(await shellBackground(page)).toBe(SURFACE.dark.rgb);
  });

  test('lets data-theme="light" override the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(RUNTIME_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MINIMAL_TITLE);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await shellBackground(page)).toBe(SURFACE.light.rgb);
  });
});
