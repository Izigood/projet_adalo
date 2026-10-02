import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fr from '../apps/runtime/src/locales/fr.json' with { type: 'json' };
import { CORRUPTED_FIXTURES, addPage, minimalFixture } from '../packages/testing/src/index.js';
import type { FixtureFiles } from '../packages/testing/src/index.js';
import { serveProject } from './serve-fixture.js';
import { MINIMAL_TITLE, RUNTIME_URL } from './targets.js';

const h1 = (page: Page) => page.getByRole('heading', { level: 1 });
const shellBackground = (page: Page) =>
  page.locator('acs-runtime-root').evaluate((el) => getComputedStyle(el).backgroundColor);

const themeOf = (files: FixtureFiles) =>
  files[Object.keys(files).find((path) => path.startsWith('themes/')) as string] as {
    modes: { light: Record<string, string>; dark: Record<string, string> };
  };

/** The minimal project with one more page. */
const withPage = (spec: Parameters<typeof addPage>[1]): FixtureFiles => {
  const files = minimalFixture();
  addPage(files, spec);
  return files;
};

test.describe('Runtime shell', () => {
  test('opens a deep link on its page, with the typed parameter accepted', async ({ page }) => {
    await serveProject(
      page,
      withPage({ key: 'order', route: '/orders/:id', params: [{ name: 'id', type: 'integer' }] }),
    );
    await page.goto(`${RUNTIME_URL}/#/orders/42`);
    await expect(h1(page)).toHaveText('Page order');
  });

  test('refuses an invalid parameter and an unknown address with the 404 page', async ({
    page,
  }) => {
    await serveProject(
      page,
      withPage({ key: 'order', route: '/orders/:id', params: [{ name: 'id', type: 'integer' }] }),
    );
    await page.goto(`${RUNTIME_URL}/#/orders/abc`);
    await expect(h1(page)).toHaveText(fr['runtime.notFound.title']);
    await expect(page.getByText(fr['runtime.invalidParam.text'])).toBeVisible();
    await page.goto(`${RUNTIME_URL}/#/nowhere`);
    await expect(h1(page)).toHaveText(fr['runtime.notFound.title']);
    await expect(page.getByText(fr['runtime.notFound.text'])).toBeVisible();
  });

  test('goes back to the home page from the link of the 404 page', async ({ page }) => {
    await serveProject(page);
    await page.goto(`${RUNTIME_URL}/#/nowhere`);
    const back = page.getByRole('link', { name: fr['runtime.notFound.back'] });
    // Asserting first: a click on a missing link would wait for the whole test timeout.
    await expect(back).toBeVisible();
    await back.click();
    await expect(h1(page)).toHaveText(MINIMAL_TITLE);
  });

  test('sends the root to the initial page when it has another route', async ({ page }) => {
    const files = minimalFixture();
    const pagePath = Object.keys(files).find((path) => /^pages\/[0-9a-f-]{36}\.json$/.test(path));
    (files[pagePath as string] as { route: string }).route = '/start';
    (files['pages/index.json'] as { routes: { route: string }[] }).routes[0]!.route = '/start';
    await serveProject(page, files);
    await page.goto(RUNTIME_URL);
    await expect(h1(page)).toHaveText(MINIMAL_TITLE);
    await expect(page).toHaveURL(/#\/start$/);
  });

  test('refuses a page guarded by a role the local user does not hold', async ({ page }) => {
    await serveProject(
      page,
      withPage({ key: 'admin', route: '/admin', guards: [{ kind: 'role', role: 'admin' }] }),
    );
    await page.goto(`${RUNTIME_URL}/#/admin`);
    await expect(h1(page)).toHaveText(fr['runtime.denied.title']);
    await expect(page.getByText('Page admin')).toHaveCount(0);
  });

  test('shows the JSON path of the defect when the package is invalid', async ({ page }) => {
    const defect = CORRUPTED_FIXTURES.find((c) => c.name === 'project key in lower case (RG-11)');
    await serveProject(page, defect?.build().files ?? {});
    await page.goto(RUNTIME_URL);
    await expect(h1(page)).toHaveText(fr['runtime.bootError.title']);
    await expect(page.getByText('/project/key')).toBeVisible();
  });

  test('says why instead of showing a blank page when the project is missing', async ({ page }) => {
    await serveProject(page, {});
    await page.goto(RUNTIME_URL);
    await expect(h1(page)).toHaveText(fr['runtime.bootError.title']);
    await expect(page.getByText('project.json').first()).toBeVisible();
  });

  test('changes the rendering when a design token of the project changes', async ({ page }) => {
    const files = minimalFixture();
    themeOf(files).modes.light['color.surface'] = '#abcdef';
    await serveProject(page, files);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(RUNTIME_URL);
    await expect(h1(page)).toHaveText(MINIMAL_TITLE);
    expect(await shellBackground(page)).toBe('rgb(171, 205, 239)');
  });

  test('changes the dark rendering when a dark token of the project changes', async ({ page }) => {
    const files = minimalFixture();
    themeOf(files).modes.dark['color.surface'] = '#102030';
    await serveProject(page, files);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(RUNTIME_URL);
    await expect(h1(page)).toHaveText(MINIMAL_TITLE);
    expect(await shellBackground(page)).toBe('rgb(16, 32, 48)');
  });
});
