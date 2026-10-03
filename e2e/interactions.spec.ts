import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { interactiveFixture } from '../packages/testing/src/index.js';
import { serveProject } from './serve-fixture.js';
import { INTERACTIVE_TITLE, RUNTIME_URL } from './targets.js';

/**
 * The components that have behaviour, played with the keyboard in the real browsers: what the unit
 * tests (happy-dom) cannot show, such as the focus of a native dialog inside a shadow DOM.
 */
type Recorded = { type: string; detail: unknown };
const store = (window: unknown) => window as { __acs?: Recorded[] };

async function open(page: Page): Promise<void> {
  await serveProject(page, interactiveFixture());
  await page.goto(RUNTIME_URL);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(INTERACTIVE_TITLE);
  // The whole page, not just its title: these specs prove nothing on a page that lacks the components.
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Supprimer' })).toBeVisible();
}

/** Records the `acs-*` events that reach the document (they cross the shadow boundaries). */
async function record(page: Page, names: string[]): Promise<void> {
  await page.evaluate((events) => {
    const holder = window as unknown as { __acs?: Recorded[] };
    holder.__acs = [];
    for (const name of events) {
      document.addEventListener(name, (event) => {
        holder.__acs?.push({ type: event.type, detail: (event as CustomEvent).detail ?? null });
      });
    }
  }, names);
}

const recorded = (page: Page): Promise<Recorded[]> =>
  page.evaluate(() => (window as unknown as { __acs?: Recorded[] }).__acs ?? []);

const blockingViolations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    );
};

test.describe('Runtime interactions', () => {
  test.describe('tabs', () => {
    test('show the panel of the selected tab and move with the arrow keys, Home and End', async ({
      page,
    }) => {
      await open(page);
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      // The content of a panel is a child of the component, projected into the panel by a slot: it
      // is not a descendant of the panel in the DOM, so its text is checked on its own.
      await expect(page.getByRole('tabpanel', { name: 'Résumé' })).toBeVisible();
      await expect(page.getByText('Contenu du résumé')).toBeVisible();
      await expect(page.getByText('Contenu du détail')).toBeHidden();
      await page.getByRole('tab', { name: 'Résumé' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Détail' })).toBeFocused();
      await expect(page.getByRole('tab', { name: 'Détail' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByRole('tabpanel', { name: 'Détail' })).toBeVisible();
      await expect(page.getByText('Contenu du détail')).toBeVisible();
      await expect(page.getByText('Contenu du résumé')).toBeHidden();
      await page.keyboard.press('End');
      await expect(page.getByRole('tab', { name: 'Historique' })).toBeFocused();
      await page.keyboard.press('Home');
      await expect(page.getByRole('tab', { name: 'Résumé' })).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByRole('tab', { name: 'Historique' })).toBeFocused();
    });

    test('keep the panel role of a stack used as a panel (regression of the review of lot 3)', async ({
      page,
    }) => {
      await open(page);
      await page.getByRole('tab', { name: 'Historique' }).click();
      const panel = page.getByRole('tabpanel', { name: 'Historique' });
      await expect(panel).toBeVisible();
      await expect(page.getByText("Contenu de l'historique")).toBeVisible();
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      // The defect only showed once the stack was updated: crossing a breakpoint makes the Runtime
      // draw the page again, with new props for every component.
      await page.setViewportSize({ width: 360, height: 900 });
      await expect(page.getByRole('tabpanel', { name: 'Historique' })).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(page.getByRole('tabpanel', { name: 'Historique' })).toBeVisible();
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
    });
  });

  test.describe('menu of actions', () => {
    test('opens with the keyboard, skips a disabled item, says what was chosen and gives the focus back', async ({
      page,
    }) => {
      await open(page);
      await record(page, ['acs-select']);
      const trigger = page.getByRole('button', { name: 'Actions' });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name: 'Archiver' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(await recorded(page)).toEqual([{ type: 'acs-select', detail: { key: 'archive' } }]);
    });

    test('closes with Escape, giving the focus back, and with a click outside', async ({
      page,
    }) => {
      await open(page);
      const trigger = page.getByRole('button', { name: 'Actions' });
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.getByRole('heading', { level: 1 }).click();
      await expect(page.getByRole('menu')).toBeHidden();
    });
  });

  test.describe('confirmation', () => {
    test('asks in a modal dialog, starts on Annuler, keeps the focus inside, and Escape cancels', async ({
      page,
    }) => {
      await open(page);
      await record(page, ['acs-confirm', 'acs-cancel']);
      const trigger = page.getByRole('button', { name: 'Supprimer' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Supprimer la commande ?' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Cette action est définitive.');
      await expect(page.getByRole('button', { name: 'Annuler' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Confirmer' })).toBeFocused();
      // One Tab more, from the last button of a modal dialog. Chromium and Firefox come back to the
      // first button; WebKit hands the focus to the browser itself, which the specification allows.
      // What must hold in all three is that the focus never lands on the page behind the dialog.
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Supprimer' })).not.toBeFocused();
      await expect(page.getByRole('button', { name: 'Actions' })).not.toBeFocused();
      await expect(page.getByRole('tab', { name: 'Résumé' })).not.toBeFocused();
    });

    test('Escape cancels, closes the dialog, gives the focus back to the button and says acs-cancel once', async ({
      page,
    }) => {
      await open(page);
      await record(page, ['acs-confirm', 'acs-cancel']);
      const trigger = page.getByRole('button', { name: 'Supprimer' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Supprimer la commande ?' });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(await recorded(page)).toEqual([{ type: 'acs-cancel', detail: null }]);
    });

    test('says acs-confirm once and closes when the user confirms', async ({ page }) => {
      await open(page);
      await record(page, ['acs-confirm', 'acs-cancel']);
      await page.getByRole('button', { name: 'Supprimer' }).click();
      await page.getByRole('button', { name: 'Confirmer' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      expect(await recorded(page)).toEqual([{ type: 'acs-confirm', detail: null }]);
    });
  });

  test('accordion: one section open at a time, and the state is told to assistive technologies', async ({
    page,
  }) => {
    await open(page);
    const one = page.getByRole('button', { name: 'Un' });
    const two = page.getByRole('button', { name: 'Deux' });
    await expect(one).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Réponse un')).toBeVisible();
    await two.click();
    await expect(two).toHaveAttribute('aria-expanded', 'true');
    await expect(one).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Réponse deux')).toBeVisible();
    await expect(page.getByText('Réponse un')).toBeHidden();
  });

  test('notification: can be closed, and says so', async ({ page }) => {
    await open(page);
    await record(page, ['acs-dismiss']);
    const notification = page.getByRole('status');
    await expect(notification).toContainText('Projet enregistré');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(notification).toBeHidden();
    expect(await recorded(page)).toEqual([{ type: 'acs-dismiss', detail: null }]);
  });

  test.describe('no serious or critical accessibility violation (axe-core) while it is open', () => {
    test('with the menu open', async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Actions' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
    });

    test('with the dialog open', async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Supprimer' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
    });

    test('with a tab selected and a section open', async ({ page }) => {
      await open(page);
      await page.getByRole('tab', { name: 'Détail' }).click();
      await page.getByRole('button', { name: 'Deux' }).click();
      // The states are asserted before the audit: on a page where nothing happens, the audit alone
      // would pass and prove nothing about the open states.
      await expect(page.getByRole('tabpanel', { name: 'Détail' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Deux' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(page.getByText('Réponse deux')).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
    });
  });
});

void store;
