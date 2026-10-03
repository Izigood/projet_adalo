import { validateProps } from '@acs/component-sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BASE_DEFINITIONS, defineBaseElements } from './index.js';
import { mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const definition = (id: string) => {
  const found = BASE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no component ${id}`);
  return found;
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const keydown = (target: Element | null | undefined, key: string) =>
  target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('action.actionMenu', () => {
  const items = [
    { key: 'edit', label: 'Modifier' },
    { key: 'copy', label: 'Dupliquer', disabled: true },
    { key: 'archive', label: 'Archiver' },
    { key: 'remove', label: 'Supprimer' },
  ];
  const open = async () => {
    const menu = await mount('acs-action-action-menu', { label: 'Actions', items });
    return menu;
  };
  const root = (menu: Element) => menu.shadowRoot as ShadowRoot;
  const trigger = (menu: Element) => root(menu).querySelector<HTMLButtonElement>('#trigger');
  const list = (menu: Element) => root(menu).querySelector<HTMLElement>('#menu');
  const entries = (menu: Element) => [
    ...root(menu).querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ];
  const focused = (menu: Element) => root(menu).activeElement?.textContent?.trim();

  it('is a closed menu button named by its label', async () => {
    const menu = await open();
    expect(trigger(menu)?.textContent).toContain('Actions');
    expect(trigger(menu)?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('false');
    expect(list(menu)?.hasAttribute('hidden')).toBe(true);
    expect(list(menu)?.getAttribute('role')).toBe('menu');
    expect(entries(menu).map((entry) => entry.textContent?.trim())).toEqual([
      'Modifier',
      'Dupliquer',
      'Archiver',
      'Supprimer',
    ]);
  });

  it('opens on click and puts the focus on the first enabled item', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    await settle();
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('true');
    expect(list(menu)?.hasAttribute('hidden')).toBe(false);
    expect(focused(menu)).toBe('Modifier');
  });

  it('closes on a second click of the button', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    trigger(menu)?.click();
    await menu.updateComplete;
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens with Down on the first item and with Up on the last one', async () => {
    const down = await open();
    keydown(trigger(down), 'ArrowDown');
    await down.updateComplete;
    await settle();
    expect(focused(down)).toBe('Modifier');
    const up = await open();
    keydown(trigger(up), 'ArrowUp');
    await up.updateComplete;
    await settle();
    expect(focused(up)).toBe('Supprimer');
  });

  it('moves through the enabled items with the arrows, wrapping, skipping the disabled one', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    await settle();
    keydown(list(menu), 'ArrowDown');
    expect(focused(menu)).toBe('Archiver');
    keydown(list(menu), 'ArrowDown');
    expect(focused(menu)).toBe('Supprimer');
    keydown(list(menu), 'ArrowDown');
    expect(focused(menu)).toBe('Modifier');
    keydown(list(menu), 'ArrowUp');
    expect(focused(menu)).toBe('Supprimer');
  });

  it('jumps to the first and the last item with Home and End', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    await settle();
    keydown(list(menu), 'End');
    expect(focused(menu)).toBe('Supprimer');
    keydown(list(menu), 'Home');
    expect(focused(menu)).toBe('Modifier');
  });

  it('closes with Escape and gives the focus back to the button', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    await settle();
    keydown(list(menu), 'Escape');
    await menu.updateComplete;
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('false');
    expect(root(menu).activeElement).toBe(trigger(menu));
  });

  it('closes with Tab, leaving the focus to move on', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    keydown(list(menu), 'Tab');
    await menu.updateComplete;
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('says which action was chosen with acs-select, closes and gives the focus back', async () => {
    const menu = await open();
    const chosen: unknown[] = [];
    menu.addEventListener('acs-select', (event) => chosen.push((event as CustomEvent).detail));
    trigger(menu)?.click();
    await menu.updateComplete;
    entries(menu)[2]?.click();
    await menu.updateComplete;
    expect(chosen).toEqual([{ key: 'archive' }]);
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('false');
    expect(root(menu).activeElement).toBe(trigger(menu));
  });

  it('says nothing when a disabled item is clicked', async () => {
    const menu = await open();
    const chosen: unknown[] = [];
    menu.addEventListener('acs-select', (event) => chosen.push(event));
    trigger(menu)?.click();
    await menu.updateComplete;
    expect(entries(menu)[1]?.disabled).toBe(true);
    entries(menu)[1]?.click();
    expect(chosen).toEqual([]);
  });

  it('closes on a press outside, and stays open on a press inside', async () => {
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    entries(menu)[0]?.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await menu.updateComplete;
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('true');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await menu.updateComplete;
    expect(trigger(menu)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('stops listening to the page once it is closed or removed', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const menu = await open();
    trigger(menu)?.click();
    await menu.updateComplete;
    menu.remove();
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('shows its texts as text, never as markup', async () => {
    const menu = await mount('acs-action-action-menu', {
      label: '<b>x</b>',
      items: [{ key: 'a', label: '<img src=x onerror=alert(1)>' }],
    });
    expect(root(menu).querySelector('b, img')).toBeNull();
  });

  it('refuses an item key that is not a readable key, and an empty list', () => {
    const def = definition('action.actionMenu');
    expect(validateProps(def, { label: 'x', items: [{ key: 'Bad key', label: 'y' }] }).ok).toBe(
      false,
    );
    expect(validateProps(def, { label: 'x', items: [] }).ok).toBe(false);
    expect(validateProps(def, { label: 'x', items: [{ key: 'ok', label: 'y' }] }).ok).toBe(true);
  });
});

describe('action.confirmation', () => {
  const props = {
    label: 'Supprimer',
    title: 'Supprimer la commande ?',
    message: 'Cette action est définitive.',
  };
  const root = (element: Element) => element.shadowRoot as ShadowRoot;
  const dialog = (element: Element) => root(element).querySelector('dialog') as HTMLDialogElement;
  const trigger = (element: Element) =>
    root(element).querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  const confirmButton = (element: Element) =>
    root(element).querySelector<HTMLButtonElement>('.confirm');
  const cancelButton = (element: Element) =>
    root(element).querySelector<HTMLButtonElement>('.cancel');
  const events = (element: Element) => {
    const seen: string[] = [];
    for (const name of ['acs-confirm', 'acs-cancel'])
      element.addEventListener(name, () => seen.push(name));
    return seen;
  };

  it('is a button named by its label, with a closed dialog', async () => {
    const element = await mount('acs-action-confirmation', props);
    expect(trigger(element)?.textContent?.trim()).toBe('Supprimer');
    expect(dialog(element).open).toBe(false);
  });

  it('opens a dialog named by its title and described by its message', async () => {
    const element = await mount('acs-action-confirmation', props);
    trigger(element)?.click();
    expect(dialog(element).open).toBe(true);
    expect(dialog(element).getAttribute('aria-labelledby')).toBe('title');
    expect(dialog(element).getAttribute('aria-describedby')).toBe('message');
    expect(root(element).querySelector('#title')?.textContent).toBe('Supprimer la commande ?');
    expect(root(element).querySelector('#message')?.textContent).toBe(
      'Cette action est définitive.',
    );
  });

  it('asks « Confirmer » and « Annuler » unless it is told other words', async () => {
    const element = await mount('acs-action-confirmation', props);
    expect(confirmButton(element)?.textContent?.trim()).toBe('Confirmer');
    expect(cancelButton(element)?.textContent?.trim()).toBe('Annuler');
    const custom = await mount('acs-action-confirmation', {
      ...props,
      confirmLabel: 'Oui, supprimer',
      cancelLabel: 'Non',
    });
    expect(confirmButton(custom)?.textContent?.trim()).toBe('Oui, supprimer');
    expect(cancelButton(custom)?.textContent?.trim()).toBe('Non');
  });

  it('says acs-confirm, once, and closes', async () => {
    const element = await mount('acs-action-confirmation', props);
    const seen = events(element);
    trigger(element)?.click();
    confirmButton(element)?.click();
    expect(seen).toEqual(['acs-confirm']);
    expect(dialog(element).open).toBe(false);
  });

  it('says acs-cancel, once, and closes, when the user cancels', async () => {
    const element = await mount('acs-action-confirmation', props);
    const seen = events(element);
    trigger(element)?.click();
    cancelButton(element)?.click();
    expect(seen).toEqual(['acs-cancel']);
    expect(dialog(element).open).toBe(false);
  });

  it('says acs-cancel when the dialog is dismissed with Escape', async () => {
    const element = await mount('acs-action-confirmation', props);
    const seen = events(element);
    trigger(element)?.click();
    dialog(element).dispatchEvent(new Event('cancel'));
    expect(seen).toEqual(['acs-cancel']);
  });

  it.each([
    ['Escape', (element: Element) => dialog(element).dispatchEvent(new Event('close'))],
    ['Annuler', (element: Element) => cancelButton(element)?.click()],
    ['Confirmer', (element: Element) => confirmButton(element)?.click()],
  ])(
    'gives the focus back to its button when it is closed with %s (a mouse press does not focus a button in Safari)',
    async (_how, close) => {
      const element = await mount('acs-action-confirmation', props);
      trigger(element)?.click();
      expect(root(element).activeElement).not.toBe(trigger(element));
      close(element);
      expect(root(element).activeElement).toBe(trigger(element));
    },
  );

  it('says nothing before the user answers', async () => {
    const element = await mount('acs-action-confirmation', props);
    const seen = events(element);
    trigger(element)?.click();
    expect(seen).toEqual([]);
  });

  it('puts the focus on « Annuler » for a dangerous action and on « Confirmer » otherwise', async () => {
    const danger = await mount('acs-action-confirmation', { ...props, tone: 'danger' });
    trigger(danger)?.click();
    expect(root(danger).activeElement).toBe(cancelButton(danger));
    const normal = await mount('acs-action-confirmation', props);
    trigger(normal)?.click();
    expect(root(normal).activeElement).toBe(confirmButton(normal));
  });

  it.each(['default', 'danger'])('reflects the %s tone', async (tone) => {
    expect((await mount('acs-action-confirmation', { ...props, tone })).getAttribute('tone')).toBe(
      tone,
    );
  });

  it('shows its texts as text, never as markup', async () => {
    const element = await mount('acs-action-confirmation', {
      label: '<b>a</b>',
      title: '<i>b</i>',
      message: '<img src=x onerror=alert(1)>',
    });
    expect(root(element).querySelector('b, i, img')).toBeNull();
  });

  it('refuses an empty label, a missing title and an unknown tone', () => {
    const def = definition('action.confirmation');
    expect(validateProps(def, { label: '', title: 't' }).ok).toBe(false);
    expect(validateProps(def, { label: 'x' }).ok).toBe(false);
    expect(validateProps(def, { label: 'x', title: '' }).ok).toBe(false);
    expect(validateProps(def, { label: 'x', title: 't', tone: 'loud' }).ok).toBe(false);
    expect(validateProps(def, { label: 'x', title: 't' })).toMatchObject({
      ok: true,
      value: { tone: 'default', message: '' },
    });
  });
});
