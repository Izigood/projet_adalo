import { beforeAll, describe, expect, it } from 'vitest';
import { defineBaseElements } from './index.js';
import { AcsStructureAccordion } from './structure/accordion.js';
import { AcsStructureTabs } from './structure/tabs.js';
import { child, mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());

const tabButtons = (tabs: AcsStructureTabs) => [
  ...(tabs.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []),
];

const tabPanels = (tabs: AcsStructureTabs) => [
  ...(tabs.shadowRoot?.querySelectorAll<HTMLElement>('[role="tabpanel"]') ?? []),
];
const shownPanels = (tabs: AcsStructureTabs) =>
  tabPanels(tabs).map((panel) => !panel.hasAttribute('hidden'));

const press = async (tabs: AcsStructureTabs, key: string) => {
  tabs.shadowRoot
    ?.querySelector('[role="tablist"]')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await tabs.updateComplete;
};

describe('structure.tabs', () => {
  const props = { label: 'Fiche', tabs: ['Résumé', 'Détail', 'Historique'], selected: 0 };
  const panels = () => [child('p', 'A'), child('p', 'B'), child('p', 'C')];

  it('is a list of tabs named by its label, one button per title', async () => {
    const tabs = (await mount('acs-structure-tabs', props, panels())) as AcsStructureTabs;
    expect(tabs.shadowRoot?.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Fiche',
    );
    expect(tabButtons(tabs).map((button) => button.textContent?.trim())).toEqual([
      'Résumé',
      'Détail',
      'Historique',
    ]);
  });

  it('shows the panel of the selected tab only, and marks the panels', async () => {
    const tabs = (await mount(
      'acs-structure-tabs',
      { ...props, selected: 1 },
      panels(),
    )) as AcsStructureTabs;
    expect(shownPanels(tabs)).toEqual([false, true, false]);
    expect(tabPanels(tabs).map((panel) => panel.getAttribute('role'))).toEqual([
      'tabpanel',
      'tabpanel',
      'tabpanel',
    ]);
  });

  it('relates each tab to its panel both ways, and lets the panel take focus', async () => {
    const tabs = (await mount('acs-structure-tabs', props, panels())) as AcsStructureTabs;
    tabButtons(tabs).forEach((button, index) => {
      expect(button.getAttribute('aria-controls')).toBe(`panel-${index}`);
      const panel = tabPanels(tabs)[index];
      expect(panel?.id).toBe(`panel-${index}`);
      expect(panel?.getAttribute('aria-labelledby')).toBe(button.id);
      expect(panel?.getAttribute('tabindex')).toBe('0');
    });
  });

  it('puts each child in the panel at its position, without touching the child itself', async () => {
    const children = panels();
    const tabs = (await mount('acs-structure-tabs', props, children)) as AcsStructureTabs;
    expect(children.map((child) => child.getAttribute('slot'))).toEqual([
      'panel-0',
      'panel-1',
      'panel-2',
    ]);
    for (const child of children) {
      expect(child.hasAttribute('role')).toBe(false);
      expect(child.hasAttribute('aria-label')).toBe(false);
      expect(child.hasAttribute('hidden')).toBe(false);
    }
    expect(tabs.shadowRoot?.querySelectorAll('slot[name^="panel-"]')).toHaveLength(3);
  });

  it('keeps the role of a component used as a panel, and the role of the panel, after an update', async () => {
    // Regression: the panel role used to be written on the child, and a stack, a grid or a page
    // wrote role="none" back on itself at its next update, which lost the tab panel.
    const stack = document.createElement('acs-structure-stack') as HTMLElement & {
      props?: object;
      updateComplete: Promise<unknown>;
    };
    stack.props = { gap: 'md' };
    const tabs = (await mount('acs-structure-tabs', props, [stack])) as AcsStructureTabs;
    await stack.updateComplete;
    stack.props = { gap: 'lg' };
    await stack.updateComplete;
    await tabs.updateComplete;
    expect(stack.getAttribute('role')).toBe('none');
    expect(tabPanels(tabs)[0]?.getAttribute('role')).toBe('tabpanel');
    expect(stack.getAttribute('slot')).toBe('panel-0');
  });

  it('keeps only the selected tab in the tab order (roving tabindex)', async () => {
    const tabs = (await mount(
      'acs-structure-tabs',
      { ...props, selected: 2 },
      panels(),
    )) as AcsStructureTabs;
    expect(tabButtons(tabs).map((button) => button.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
    ]);
    expect(tabButtons(tabs).map((button) => button.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('selects a tab on click and says so', async () => {
    const tabs = (await mount('acs-structure-tabs', props, panels())) as AcsStructureTabs;
    const events: unknown[] = [];
    tabs.addEventListener('acs-change', (event) => events.push((event as CustomEvent).detail));
    tabButtons(tabs)[2]?.click();
    await tabs.updateComplete;
    expect(events).toEqual([{ index: 2 }]);
    expect(shownPanels(tabs)).toEqual([false, false, true]);
  });

  it('does not announce a click on the tab that is already selected', async () => {
    const tabs = (await mount('acs-structure-tabs', props, panels())) as AcsStructureTabs;
    const events: unknown[] = [];
    tabs.addEventListener('acs-change', (event) => events.push(event));
    tabButtons(tabs)[0]?.click();
    expect(events).toEqual([]);
  });

  it('moves with the arrow keys, wrapping around, and with Home and End', async () => {
    const tabs = (await mount('acs-structure-tabs', props, panels())) as AcsStructureTabs;
    const selected = () =>
      tabButtons(tabs).findIndex((button) => button.getAttribute('aria-selected') === 'true');
    await press(tabs, 'ArrowRight');
    expect(selected()).toBe(1);
    await press(tabs, 'End');
    expect(selected()).toBe(2);
    await press(tabs, 'ArrowRight');
    expect(selected()).toBe(0);
    await press(tabs, 'ArrowLeft');
    expect(selected()).toBe(2);
    await press(tabs, 'Home');
    expect(selected()).toBe(0);
  });

  it('ignores the other keys', async () => {
    const tabs = (await mount('acs-structure-tabs', props, panels())) as AcsStructureTabs;
    await press(tabs, 'a');
    expect(tabButtons(tabs)[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps a selection that is out of range inside the tabs', async () => {
    const tabs = (await mount(
      'acs-structure-tabs',
      { ...props, selected: 9 },
      panels(),
    )) as AcsStructureTabs;
    expect(tabButtons(tabs)[2]?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows its titles as text, never as markup', async () => {
    const tabs = (await mount('acs-structure-tabs', {
      label: 'x',
      tabs: ['<img src=x onerror=alert(1)>'],
    })) as AcsStructureTabs;
    expect(tabs.shadowRoot?.querySelector('img')).toBeNull();
    expect(tabButtons(tabs)[0]?.textContent?.trim()).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('structure.accordion', () => {
  const props = { label: 'Questions', items: ['Un', 'Deux', 'Trois'], open: [0], multiple: false };
  const contents = () => [child('p', 'A'), child('p', 'B'), child('p', 'C')];
  const headers = (accordion: AcsStructureAccordion) => [
    ...(accordion.shadowRoot?.querySelectorAll<HTMLButtonElement>('.header') ?? []),
  ];
  const expanded = (accordion: AcsStructureAccordion) =>
    headers(accordion).map((button) => button.getAttribute('aria-expanded'));

  it('is a group named by its label, with one button per title', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      props,
      contents(),
    )) as AcsStructureAccordion;
    expect(accordion.shadowRoot?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Questions',
    );
    expect(headers(accordion).map((button) => button.textContent?.trim())).toEqual([
      'Un',
      'Deux',
      'Trois',
    ]);
  });

  it('puts each child in the slot of its section', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      props,
      contents(),
    )) as AcsStructureAccordion;
    expect([...accordion.children].map((content) => content.getAttribute('slot'))).toEqual([
      'panel-0',
      'panel-1',
      'panel-2',
    ]);
    expect(accordion.shadowRoot?.querySelectorAll('slot[name^="panel-"]')).toHaveLength(3);
  });

  it('relates each header to its panel both ways, and names a panel as a region', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      props,
      contents(),
    )) as AcsStructureAccordion;
    const panels = [...(accordion.shadowRoot?.querySelectorAll<HTMLElement>('.panel') ?? [])];
    headers(accordion).forEach((header, index) => {
      expect(header.getAttribute('aria-controls')).toBe(`panel-${index}`);
      expect(panels[index]?.id).toBe(`panel-${index}`);
      expect(panels[index]?.getAttribute('role')).toBe('region');
      expect(panels[index]?.getAttribute('aria-labelledby')).toBe(header.id);
    });
  });

  it('does not make a landmark of every panel when there are many sections', async () => {
    const many = {
      ...props,
      items: Array.from({ length: 7 }, (_, index) => `Section ${index}`),
    };
    const accordion = (await mount('acs-structure-accordion', many)) as AcsStructureAccordion;
    const panels = [...(accordion.shadowRoot?.querySelectorAll<HTMLElement>('.panel') ?? [])];
    expect(panels).toHaveLength(7);
    expect(panels.every((panel) => !panel.hasAttribute('role'))).toBe(true);
  });

  it('starts with the sections it is told to open', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      { ...props, open: [1] },
      contents(),
    )) as AcsStructureAccordion;
    expect(expanded(accordion)).toEqual(['false', 'true', 'false']);
    const hidden = [...(accordion.shadowRoot?.querySelectorAll('.panel') ?? [])].map((panel) =>
      panel.hasAttribute('hidden'),
    );
    expect(hidden).toEqual([true, false, true]);
  });

  it('opens and closes a section on click and says so', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      { ...props, open: [] },
      contents(),
    )) as AcsStructureAccordion;
    const events: unknown[] = [];
    accordion.addEventListener('acs-toggle', (event) => events.push((event as CustomEvent).detail));
    headers(accordion)[1]?.click();
    await accordion.updateComplete;
    expect(expanded(accordion)).toEqual(['false', 'true', 'false']);
    headers(accordion)[1]?.click();
    await accordion.updateComplete;
    expect(expanded(accordion)).toEqual(['false', 'false', 'false']);
    expect(events).toEqual([
      { index: 1, open: true },
      { index: 1, open: false },
    ]);
  });

  it('closes the other section when only one may be open', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      props,
      contents(),
    )) as AcsStructureAccordion;
    headers(accordion)[2]?.click();
    await accordion.updateComplete;
    expect(expanded(accordion)).toEqual(['false', 'false', 'true']);
  });

  it('keeps several sections open when it is allowed to', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      { ...props, multiple: true, open: [0, 1] },
      contents(),
    )) as AcsStructureAccordion;
    expect(expanded(accordion)).toEqual(['true', 'true', 'false']);
    headers(accordion)[2]?.click();
    await accordion.updateComplete;
    expect(expanded(accordion)).toEqual(['true', 'true', 'true']);
  });

  it('opens a single section at start when several are listed but only one is allowed', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      { ...props, open: [0, 1, 2] },
      contents(),
    )) as AcsStructureAccordion;
    expect(expanded(accordion)).toEqual(['true', 'false', 'false']);
  });

  it('ignores a section to open that does not exist', async () => {
    const accordion = (await mount(
      'acs-structure-accordion',
      { ...props, open: [7] },
      contents(),
    )) as AcsStructureAccordion;
    expect(expanded(accordion)).toEqual(['false', 'false', 'false']);
  });
});

describe('structure.sidePanel', () => {
  it('is a complementary region named by its title', async () => {
    const panel = await mount('acs-structure-side-panel', { title: 'Filtres' }, [
      child('p', 'Contenu'),
    ]);
    const aside = panel.shadowRoot?.querySelector('aside');
    expect(aside?.getAttribute('aria-labelledby')).toBe('title');
    expect(panel.shadowRoot?.querySelector('#title')?.textContent).toBe('Filtres');
    expect(panel.textContent).toBe('Contenu');
  });

  it('goes at the end by default and at the start on request', async () => {
    expect((await mount('acs-structure-side-panel', { title: 'T' })).getAttribute('position')).toBe(
      'end',
    );
    expect(
      (await mount('acs-structure-side-panel', { title: 'T', position: 'start' })).getAttribute(
        'position',
      ),
    ).toBe('start');
  });

  it('shows its title as text, never as markup', async () => {
    const panel = await mount('acs-structure-side-panel', { title: '<b>x</b>' });
    expect(panel.shadowRoot?.querySelector('b')).toBeNull();
  });
});
