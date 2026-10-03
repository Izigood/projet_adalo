import { validateProps } from '@acs/component-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE_DEFINITIONS, defineBaseElements } from './index.js';
import { mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());

const definition = (id: string) => {
  const found = BASE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no component ${id}`);
  return found;
};

describe('action.button', () => {
  const button = (element: Element) => element.shadowRoot?.querySelector('button');

  it('is a button that shows its label and does not submit a form', async () => {
    const element = await mount('acs-action-button', { label: 'Enregistrer' });
    expect(button(element)?.textContent?.trim()).toBe('Enregistrer');
    expect(button(element)?.getAttribute('type')).toBe('button');
  });

  it('says it was pressed with acs-press, which crosses the shadow boundary', async () => {
    const element = await mount('acs-action-button', { label: 'Ok' });
    const events: Event[] = [];
    element.addEventListener('acs-press', (event) => events.push(event));
    button(element)?.click();
    expect(events).toHaveLength(1);
    expect(events[0]?.bubbles).toBe(true);
    expect(events[0]?.composed).toBe(true);
  });

  it('says nothing when it is disabled', async () => {
    const element = await mount('acs-action-button', { label: 'Ok', disabled: true });
    const events: Event[] = [];
    element.addEventListener('acs-press', (event) => events.push(event));
    button(element)?.click();
    expect(button(element)?.disabled).toBe(true);
    expect(events).toEqual([]);
  });

  it('is enabled by default', async () => {
    expect(button(await mount('acs-action-button', { label: 'Ok' }))?.disabled).toBe(false);
  });

  it.each(['primary', 'secondary', 'danger'])(
    'reflects the %s variant for the styles',
    async (variant) => {
      expect(
        (await mount('acs-action-button', { label: 'x', variant })).getAttribute('variant'),
      ).toBe(variant);
    },
  );

  it('is primary by default, and a component can override the variant per breakpoint', async () => {
    expect((await mount('acs-action-button', { label: 'x' })).getAttribute('variant')).toBe(
      'primary',
    );
    expect(definition('action.button').responsive).toEqual(['variant']);
  });

  it('gives each coloured variant the text colour made for it', () => {
    const css = (
      customElements.get('acs-action-button') as unknown as { styles: { cssText: string }[] }
    ).styles
      .map((sheet) => sheet.cssText)
      .join('\n');
    expect(css).toContain('--acs-color-on-primary');
    expect(css).toContain('--acs-color-on-danger');
  });

  it('shows its label as text, never as markup', async () => {
    const element = await mount('acs-action-button', { label: '<img src=x onerror=alert(1)>' });
    expect(element.shadowRoot?.querySelector('img')).toBeNull();
  });

  it('is primary and enabled when the manifest says nothing (defaults of the schema)', () => {
    expect(validateProps(definition('action.button'), { label: 'x' })).toMatchObject({
      ok: true,
      value: { variant: 'primary', disabled: false },
    });
  });

  it('refuses an empty label and an unknown variant', () => {
    expect(validateProps(definition('action.button'), { label: '' }).ok).toBe(false);
    expect(validateProps(definition('action.button'), { label: 'x', variant: 'huge' }).ok).toBe(
      false,
    );
  });
});

describe('action.notification', () => {
  const box = (element: Element) => element.shadowRoot?.querySelector('[role="status"]');
  const close = (element: Element) =>
    element.shadowRoot?.querySelector<HTMLButtonElement>('.close');
  const spoken = (element: Element) => box(element)?.textContent?.replace(/\s+/g, ' ').trim();

  it('is a polite live region that starts with the word naming its tone', async () => {
    const element = await mount('acs-action-notification', {
      message: 'Projet enregistré',
      tone: 'success',
    });
    expect(box(element)).not.toBeNull();
    expect(spoken(element)).toBe('Succès : Projet enregistré ×');
  });

  it.each([
    ['info', 'Information :'],
    ['success', 'Succès :'],
    ['warning', 'Attention :'],
    ['danger', 'Erreur :'],
  ])('starts a %s notification with « %s »', async (tone, lead) => {
    const element = await mount('acs-action-notification', { message: 'm', tone });
    expect(element.shadowRoot?.querySelector('strong')?.textContent).toBe(lead);
    expect(element.getAttribute('tone')).toBe(tone);
  });

  it('can be closed, and says so', async () => {
    const element = await mount('acs-action-notification', { message: 'Bonjour' });
    const events: Event[] = [];
    element.addEventListener('acs-dismiss', (event) => events.push(event));
    close(element)?.click();
    await element.updateComplete;
    expect(events).toHaveLength(1);
    expect(box(element)).toBeNull();
  });

  it('names its close button (it only shows a cross)', async () => {
    const element = await mount('acs-action-notification', { message: 'Bonjour' });
    expect(close(element)?.getAttribute('aria-label')).toBe('Fermer');
  });

  it('shows a new message after the previous one was closed', async () => {
    const element = await mount('acs-action-notification', { message: 'Premier' });
    close(element)?.click();
    await element.updateComplete;
    element.props = { message: 'Second' };
    await element.updateComplete;
    expect(spoken(element)).toContain('Second');
  });

  it('has no close button when it is not dismissible', async () => {
    const element = await mount('acs-action-notification', { message: 'Fixe', dismissible: false });
    expect(close(element)).toBeNull();
    expect(box(element)).not.toBeNull();
  });

  it('has no timer: it is still there after a while', async () => {
    const element = await mount('acs-action-notification', { message: 'Reste' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await element.updateComplete;
    expect(box(element)).not.toBeNull();
  });

  it('shows its message as text, never as markup', async () => {
    const element = await mount('acs-action-notification', {
      message: '<img src=x onerror=alert(1)>',
    });
    expect(element.shadowRoot?.querySelector('img')).toBeNull();
  });
});

describe('action.notification, when the Runtime draws the page again', () => {
  const box = (element: Element) => element.shadowRoot?.querySelector('[role="status"]');

  it('does not bring back a notification the user closed when the message has not changed', async () => {
    const props = { message: 'Projet enregistré', tone: 'success' };
    const element = await mount('acs-action-notification', props);
    element.shadowRoot?.querySelector<HTMLButtonElement>('.close')?.click();
    await element.updateComplete;
    element.props = { ...props };
    await element.updateComplete;
    expect(box(element)).toBeNull();
  });

  it('shows it again when the message, or its tone, is not the same', async () => {
    const props = { message: 'Projet enregistré', tone: 'success' };
    const element = await mount('acs-action-notification', props);
    element.shadowRoot?.querySelector<HTMLButtonElement>('.close')?.click();
    await element.updateComplete;
    element.props = { ...props, tone: 'danger' };
    await element.updateComplete;
    expect(box(element)).not.toBeNull();
  });
});
