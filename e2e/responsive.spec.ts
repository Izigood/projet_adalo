import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { responsiveFixture } from '../packages/testing/src/index.js';
import { serveProject } from './serve-fixture.js';
import { RESPONSIVE_TITLE, RUNTIME_URL } from './targets.js';

/** The three widths of the exit criterion of lot 3, and the columns the grid must have at each. */
const WIDTHS = [
  { width: 360, columns: 1 },
  { width: 768, columns: 2 },
  { width: 1280, columns: 4 },
] as const;
const HEIGHT = 900;

async function open(page: Page, width: number): Promise<void> {
  await serveProject(page, responsiveFixture());
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(RUNTIME_URL);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(RESPONSIVE_TITLE);
  // The whole page, not just its title: without this, "no horizontal scroll" and "no accessibility
  // violation" would pass on a nearly empty page, and prove nothing about the project.
  await expect(page.locator('acs-info-indicator')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * How many tracks the grid really has in this browser, from its resolved style. The grid is
 * asserted visible first: `evaluate` on a missing element would wait for the whole test timeout,
 * and the negative controls of the E2E gate run these specs against pages that have no grid.
 */
const columnsOf = async (page: Page): Promise<number> => {
  const grid = page.locator('acs-structure-grid');
  await expect(grid).toBeVisible();
  return grid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
  );
};

test.describe('Runtime responsive', () => {
  for (const { width, columns } of WIDTHS) {
    test(`lays the grid out in ${columns} column(s) at ${width} px`, async ({ page }) => {
      await open(page, width);
      expect(await columnsOf(page)).toBe(columns);
    });

    test(`does not scroll sideways at ${width} px`, async ({ page }) => {
      await open(page, width);
      const { scroll, inner } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(scroll).toBeLessThanOrEqual(inner);
    });

    test(`matches the reference capture at ${width} px`, async ({ page }) => {
      await open(page, width);
      await expect(page).toHaveScreenshot(`responsive-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    });
  }

  test('puts the menu in a column on a phone and in a row from the tablet up', async ({ page }) => {
    const firstTwoLinks = async () => {
      const links = page.locator('acs-navigation-menu a');
      await expect(links.nth(1)).toBeVisible();
      const [a, b] = await Promise.all([links.nth(0).boundingBox(), links.nth(1).boundingBox()]);
      return { a, b };
    };
    await open(page, 360);
    const phone = await firstTwoLinks();
    expect((phone.b?.y ?? 0) - (phone.a?.y ?? 0)).toBeGreaterThan(10);
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await expect(page.locator('acs-navigation-menu')).toHaveAttribute('orientation', 'horizontal');
    const desktop = await firstTwoLinks();
    expect(Math.abs((desktop.b?.y ?? 0) - (desktop.a?.y ?? 0))).toBeLessThan(2);
    expect((desktop.b?.x ?? 0) - (desktop.a?.x ?? 0)).toBeGreaterThan(10);
  });

  test('follows the window while it is open, without a reload', async ({ page }) => {
    await open(page, 1280);
    expect(await columnsOf(page)).toBe(4);
    await page.setViewportSize({ width: 360, height: HEIGHT });
    await expect.poll(() => columnsOf(page)).toBe(1);
    await page.setViewportSize({ width: 768, height: HEIGHT });
    await expect.poll(() => columnsOf(page)).toBe(2);
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await expect.poll(() => columnsOf(page)).toBe(4);
  });

  test('shows the line break of a text on two lines (not a layout happy-dom can measure)', async ({
    page,
  }) => {
    await open(page, 1280);
    const heights = await page
      .locator('acs-info-text')
      .evaluateAll((texts) =>
        texts.map(
          (text) => text.shadowRoot?.querySelector('p')?.getBoundingClientRect().height ?? 0,
        ),
      );
    expect(heights).toHaveLength(2);
    expect(heights[1] ?? 0).toBeGreaterThan((heights[0] ?? 0) * 1.8);
  });

  for (const { width } of [WIDTHS[0], WIDTHS[2]]) {
    test(`has no serious or critical accessibility violation at ${width} px (axe-core)`, async ({
      page,
    }) => {
      await open(page, width);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        blocking.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});
