import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fr from '../apps/studio/src/locales/fr.json' with { type: 'json' };
import { STUDIO_URL, SURFACE } from './targets.js';

const surfaceToken = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--acs-color-surface').trim(),
  );

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('Studio skeleton', () => {
  test('starts and shows the French title and status', async ({ page }) => {
    await page.goto(STUDIO_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr['studio.title']);
    await expect(page.getByText(fr['studio.subtitle'])).toBeVisible();
    await expect(page).toHaveTitle(/Studio/);
  });

  test('applies the light tokens by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(STUDIO_URL);
    expect(await surfaceToken(page)).toBe(SURFACE.light.token);
    expect(await bodyBackground(page)).toBe(SURFACE.light.rgb);
  });

  test('follows the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(STUDIO_URL);
    expect(await surfaceToken(page)).toBe(SURFACE.dark.token);
    expect(await bodyBackground(page)).toBe(SURFACE.dark.rgb);
  });

  test('lets data-theme="light" override the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(STUDIO_URL);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await bodyBackground(page)).toBe(SURFACE.light.rgb);
  });
});
