import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fr from '../apps/studio/src/locales/fr.json' with { type: 'json' };
import { STUDIO_URL } from './targets.js';

/**
 * The exit criterion of lot 5, played in the three browsers on the Studio as it is built: create a
 * project, make 200 modifications, undo them all, redo them all, reload, and find the same
 * project. Everything is done through the interface, with the real keys (Ctrl+Z, Ctrl+Shift+Z,
 * Ctrl+Y) and the real IndexedDB; what is stored is read from IndexedDB itself, not through the
 * Studio's own code. The scenario only reports, the judgement is in the specs below.
 *
 * E2E_STUDIO_SABOTAGE (negative controls of the gate, tools/gate-tests) breaks one thing of the
 * browser, never the Studio: `forgetful-storage` makes the data base a new one at each load,
 * `no-keyboard` swallows the Ctrl and Cmd shortcuts before the Studio sees them, and their default
 * action with them (Enter and the other keys still reach it), `low-contrast` greys every text.
 */
const SABOTAGE = process.env['E2E_STUDIO_SABOTAGE'];

async function sabotage(page: Page): Promise<void> {
  if (SABOTAGE === 'forgetful-storage') {
    await page.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name: string, version?: number) {
        return open.call(
          this,
          name === 'acs-studio' ? `acs-studio-${Math.random()}` : name,
          version,
        );
      };
    });
  }
  if (SABOTAGE === 'no-keyboard') {
    await page.addInitScript(() => {
      window.addEventListener(
        'keydown',
        (event) => {
          if (event.ctrlKey || event.metaKey) {
            // The key does nothing at all: the browser's own undo of a text field is not left to run.
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        true,
      );
    });
  }
  if (SABOTAGE === 'low-contrast') {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '* { color: #c8c8c8 !important; }';
        document.head.append(style);
      });
    });
  }
}

const MODIFICATIONS = { adds: 120, renames: 40, moves: 40 } as const;
const TOTAL = MODIFICATIONS.adds + MODIFICATIONS.renames + MODIFICATIONS.moves;

const label = (page: Page, text: string) => page.getByLabel(text, { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const pageKeys = (page: Page) => page.locator('nav .pages-select').allTextContents();
const status = (page: Page) => page.locator('header output');

/** Waits until the catalogue (if it is shown) has read its list. */
const catalogueReady = (page: Page) => expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

async function createProject(page: Page, key: string, name: string): Promise<void> {
  await label(page, fr['create.key']).fill(key);
  await label(page, fr['create.name']).fill(name);
  await button(page, fr['create.submit']).click();
  await expect(page.locator('.project-name')).toHaveText(name);
}

/** What IndexedDB itself holds of the projects: the catalogue rows and the packages. */
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ entries: unknown[]; packages: { id: string; files: unknown }[] }>(
        (resolve, reject) => {
          const request = indexedDB.open('acs-studio');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const names = [...db.objectStoreNames];
            if (!names.includes('projects') || !names.includes('packages')) {
              db.close();
              resolve({ entries: [], packages: [] });
              return;
            }
            const tx = db.transaction(['projects', 'packages'], 'readonly');
            const entries = tx.objectStore('projects').getAll();
            const packages = tx.objectStore('packages').getAll();
            tx.oncomplete = () => {
              db.close();
              resolve({ entries: entries.result, packages: packages.result });
            };
            tx.onerror = () => reject(tx.error);
          };
        },
      ),
  );
}

async function waitSaved(page: Page): Promise<boolean> {
  try {
    await expect(status(page)).toHaveText(fr['save.saved'], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function undoCount(page: Page): Promise<{ shown: number; older: string }> {
  return {
    shown: await page.locator('.history-list li').count(),
    older: (await page.locator('section.zone-panel').textContent()) ?? '',
  };
}

type Report = {
  created: boolean;
  history: { shown: number; older: string };
  keysAfterModifications: string[];
  savedAfterModifications: boolean;
  storedAfterModifications: unknown;
  keysAfterKeyboardUndo: string[];
  afterUndoAll: { keys: string[]; undoDisabled: boolean; redoEnabled: boolean; valid: boolean };
  keysAfterKeyboardRedo: string[];
  afterRedoAll: {
    keys: string[];
    redoDisabled: boolean;
    history: { shown: number; older: string };
  };
  savedAfterCycle: boolean;
  storedAfterCycle: unknown;
  afterReload: {
    listed: string[];
    keys: string[];
    inspector: string;
    historyEmpty: boolean;
    stored: unknown;
  };
};

async function scenario(page: Page): Promise<Report> {
  await sabotage(page);
  await page.goto(STUDIO_URL);
  await catalogueReady(page);
  await createProject(page, 'DEMO', 'Mon appli');

  // 200 modifications, all through the interface: 120 pages added, 40 renamed, 40 moved.
  for (let i = 0; i < MODIFICATIONS.adds; i += 1) {
    await label(page, fr['pages.key']).fill(`p${i}`);
    await label(page, fr['pages.key']).press('Enter');
  }
  for (let i = 0; i < MODIFICATIONS.renames; i += 1) {
    await button(page, `p${i}`).click();
    const key = label(page, fr['inspector.pageKey']);
    await key.fill(`r${i}`);
    await key.press('Enter');
  }
  for (let i = 0; i < MODIFICATIONS.moves; i += 1) {
    await button(page, `Monter la page p${MODIFICATIONS.renames + i}`).click();
  }
  const keysAfterModifications = await pageKeys(page);
  const history = await undoCount(page);
  const savedAfterModifications = await waitSaved(page);
  const storedAfterModifications = (await stored(page)).packages[0]?.files;

  // Undo with the keyboard, then with the button, until there is nothing left.
  await page.locator('h1').click();
  for (let i = 0; i < TOTAL / 2; i += 1) await page.keyboard.press('Control+z');
  const keysAfterKeyboardUndo = await pageKeys(page);
  for (let i = 0; i < TOTAL / 2; i += 1) await button(page, fr['history.undo']).click();
  const afterUndoAll = {
    keys: await pageKeys(page),
    undoDisabled: await button(page, fr['history.undo']).isDisabled(),
    redoEnabled: await button(page, fr['history.redo']).isEnabled(),
    valid: ((await page.locator('section.zone-panel').textContent()) ?? '').includes(
      fr['panel.valid'],
    ),
  };

  // Redo with Ctrl+Shift+Z and Ctrl+Y, then with the button.
  for (let i = 0; i < TOTAL / 2; i += 1) {
    await page.keyboard.press(i % 2 === 0 ? 'Control+Shift+z' : 'Control+y');
  }
  const keysAfterKeyboardRedo = await pageKeys(page);
  for (let i = 0; i < TOTAL / 2; i += 1) await button(page, fr['history.redo']).click();
  const afterRedoAll = {
    keys: await pageKeys(page),
    redoDisabled: await button(page, fr['history.redo']).isDisabled(),
    history: await undoCount(page),
  };
  const savedAfterCycle = await waitSaved(page);
  const storedAfterCycle = (await stored(page)).packages[0]?.files;

  // Reload: the project is in the catalogue, and opening it gives the same project. What is found
  // is reported even when the project cannot be opened again (a storage that forgot it).
  await page.reload();
  await catalogueReady(page);
  const listed = await page.locator('.catalog-item h3').allTextContents();
  const afterReload: Report['afterReload'] = {
    listed,
    keys: [],
    inspector: '',
    historyEmpty: false,
    stored: undefined,
  };
  try {
    await button(page, 'Ouvrir Mon appli').click();
    await expect(page.locator('.project-name')).toHaveText('Mon appli');
    afterReload.keys = await pageKeys(page);
    afterReload.inspector = await label(page, fr['inspector.pageKey']).inputValue();
    afterReload.historyEmpty = (
      (await page.locator('section.zone-panel').textContent()) ?? ''
    ).includes(fr['panel.historyEmpty']);
    afterReload.stored = (await stored(page)).packages[0]?.files;
  } catch {
    // The facts about the reload then fail one by one, and the ones before it are not lost.
  }

  return {
    created: true,
    history,
    keysAfterModifications,
    savedAfterModifications,
    storedAfterModifications,
    keysAfterKeyboardUndo,
    afterUndoAll,
    keysAfterKeyboardRedo,
    afterRedoAll,
    savedAfterCycle,
    storedAfterCycle,
    afterReload,
  };
}

/**
 * The facts of the criterion, by the words the negative controls of the gate look for in the error.
 * They are judged in one test, with soft assertions: the scenario takes a minute, so it runs once,
 * and a fact that fails does not hide the others. The error lists each fact that failed.
 */
const FACTS = {
  created: 'the project is created and opened',
  modifications: 'the 200 modifications are 200 commands of the history',
  keyboardUndo: 'Ctrl+Z undoes half of the modifications',
  undoAll: 'undoing all 200 leaves the page of welcome alone, and a valid project',
  keyboardRedo: 'Ctrl+Shift+Z and Ctrl+Y redo half of the modifications',
  redoAll: 'redoing all 200 gives the same pages in the same order',
  stored: 'IndexedDB holds the same package after undo and redo as before',
  reloaded: 'the project is the same after a reload',
} as const;

test.describe('Studio project', () => {
  test('keeps its project through 200 modifications, undo, redo and a reload', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    const page = await browser.newPage();
    let report: Report;
    try {
      report = await scenario(page);
    } finally {
      await page.close();
    }

    expect.soft(report.created, FACTS.created).toBe(true);
    expect.soft(report.keysAfterModifications[0], FACTS.created).toBe('home');

    expect
      .soft(report.keysAfterModifications, FACTS.modifications)
      .toHaveLength(1 + MODIFICATIONS.adds);
    // The panel lists the 20 latest, and says how many older ones there are.
    expect.soft(report.history.shown, FACTS.modifications).toBe(20);
    expect
      .soft(report.history.older, FACTS.modifications)
      .toContain(`… et ${TOTAL - 20} commandes plus anciennes`);

    // 100 undone of 200: the 40 moves, the 40 renames and 20 of the 120 additions.
    expect
      .soft(report.keysAfterKeyboardUndo, FACTS.keyboardUndo)
      .toHaveLength(report.keysAfterModifications.length - 20);

    expect.soft(report.afterUndoAll.keys, FACTS.undoAll).toEqual(['home']);
    expect.soft(report.afterUndoAll.undoDisabled, FACTS.undoAll).toBe(true);
    expect.soft(report.afterUndoAll.redoEnabled, FACTS.undoAll).toBe(true);
    expect.soft(report.afterUndoAll.valid, FACTS.undoAll).toBe(true);

    // From the page of welcome alone, 100 commands redone are the first 100 additions.
    expect
      .soft(report.keysAfterKeyboardRedo, FACTS.keyboardRedo)
      .toHaveLength(report.afterUndoAll.keys.length + TOTAL / 2);

    expect.soft(report.afterRedoAll.keys, FACTS.redoAll).toEqual(report.keysAfterModifications);
    expect.soft(report.afterRedoAll.redoDisabled, FACTS.redoAll).toBe(true);
    expect.soft(report.afterRedoAll.history.shown, FACTS.redoAll).toBe(20);

    expect.soft(report.savedAfterModifications, FACTS.stored).toBe(true);
    expect.soft(report.savedAfterCycle, FACTS.stored).toBe(true);
    expect.soft(report.storedAfterModifications, FACTS.stored).toBeDefined();
    expect
      .soft(JSON.stringify(report.storedAfterModifications), FACTS.stored)
      .toContain('"key":"r0"');
    expect.soft(report.storedAfterCycle, FACTS.stored).toEqual(report.storedAfterModifications);

    expect.soft(report.afterReload.listed, FACTS.reloaded).toEqual(['Mon appli']);
    expect.soft(report.afterReload.keys, FACTS.reloaded).toEqual(report.keysAfterModifications);
    expect.soft(report.afterReload.inspector, FACTS.reloaded).toBe('home');
    expect.soft(report.afterReload.historyEmpty, FACTS.reloaded).toBe(true);
    expect.soft(report.afterReload.stored, FACTS.reloaded).toEqual(report.storedAfterModifications);
  });
});
/** What axe-core reports as serious or critical, as `rule: selector | selector`. */
async function violations(page: Page): Promise<string[]> {
  const { violations: found } = await new AxeBuilder({ page }).analyze();
  return found
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
    );
}

test.describe('Studio accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const width of [1280, 360]) {
      const where = `${width} px, ${scheme} theme`;

      test(`has no serious or critical violation on the catalogue at ${where} (axe-core)`, async ({
        page,
      }) => {
        await sabotage(page);
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(STUDIO_URL);
        await catalogueReady(page);
        await createProject(page, 'AXE', 'Projet axe');
        await button(page, fr['project.close']).click();
        await catalogueReady(page);
        await expect(page.locator('.catalog-item')).toHaveCount(1);
        expect(await violations(page)).toEqual([]);
      });

      test(`has no serious or critical violation on an open project at ${where} (axe-core)`, async ({
        page,
      }) => {
        await sabotage(page);
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(STUDIO_URL);
        await catalogueReady(page);
        await createProject(page, 'AXE', 'Projet axe');
        // A page, a key that is taken (the message), and a key that is wrong (the panel).
        await label(page, fr['pages.key']).fill('orders');
        await label(page, fr['pages.key']).press('Enter');
        await label(page, fr['pages.key']).fill('home');
        await label(page, fr['pages.key']).press('Enter');
        await expect(page.getByRole('alert')).toHaveText(fr['pages.error.keyTaken']);
        const key = label(page, fr['inspector.pageKey']);
        await key.fill('Not A Key');
        await key.press('Enter');
        await expect(page.locator('.problems-list li')).toHaveCount(1);
        expect(await violations(page)).toEqual([]);
      });
    }
  }
});
