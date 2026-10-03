import { validateProps } from '@acs/component-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE_DEFINITIONS, defineBaseElements } from './index.js';
import { t } from './i18n.js';
import { mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());

const definition = (id: string) => {
  const found = BASE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no component ${id}`);
  return found;
};

describe('info.text', () => {
  it('shows its text in a paragraph', async () => {
    const text = await mount('acs-info-text', { text: 'Bonjour', tone: 'default' });
    expect(text.shadowRoot?.querySelector('p')?.textContent).toBe('Bonjour');
  });

  it('keeps line breaks and never interprets markup', async () => {
    const text = await mount('acs-info-text', { text: '<img src=x onerror=alert(1)>\nligne 2' });
    expect(text.shadowRoot?.querySelector('img')).toBeNull();
    expect(text.shadowRoot?.querySelector('p')?.textContent).toBe(
      '<img src=x onerror=alert(1)>\nligne 2',
    );
  });

  it('asks the browser to show the line breaks (checked on the real layout in the E2E suite)', () => {
    const css = (
      customElements.get('acs-info-text') as unknown as { styles: { cssText: string }[] }
    ).styles
      .map((sheet) => sheet.cssText)
      .join('\n');
    expect(css).toContain('white-space: pre-line');
  });

  it('is default-toned unless it is told it is muted', async () => {
    expect((await mount('acs-info-text', { text: 'a' })).getAttribute('tone')).toBe('default');
    expect((await mount('acs-info-text', { text: 'a', tone: 'muted' })).getAttribute('tone')).toBe(
      'muted',
    );
  });

  it('refuses a text that is too long, and can be bound to a value', () => {
    expect(validateProps(definition('info.text'), { text: 'x'.repeat(10_001) }).ok).toBe(false);
    expect(definition('info.text').bindings).toEqual([{ prop: 'text', kind: 'value' }]);
  });
});

describe('info.title', () => {
  it('is a level 1 heading by default (the title of a page)', async () => {
    const title = await mount('acs-info-title', { text: 'Bonjour' });
    expect(title.shadowRoot?.querySelector('h1')?.textContent).toBe('Bonjour');
  });

  it.each([
    [1, 'H1'],
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ])('is a level %i heading', async (level, tag) => {
    const title = await mount('acs-info-title', { text: 'T', level });
    expect(title.shadowRoot?.querySelector('h1, h2, h3, h4')?.tagName).toBe(tag);
  });

  it('shows its text as text, never as markup', async () => {
    const title = await mount('acs-info-title', { text: '<b>x</b>' });
    expect(title.shadowRoot?.querySelector('b')).toBeNull();
  });

  it('refuses an empty text and a level out of range', () => {
    const title = definition('info.title');
    expect(validateProps(title, { text: '' }).ok).toBe(false);
    expect(validateProps(title, { text: 'a', level: 0 }).ok).toBe(false);
    expect(validateProps(title, { text: 'a', level: 5 }).ok).toBe(false);
    expect(validateProps(title, { text: 'a' })).toMatchObject({ ok: true, value: { level: 1 } });
  });
});

describe('info.badge', () => {
  it('shows its text', async () => {
    const badge = await mount('acs-info-badge', { text: 'Nouveau', tone: 'success' });
    expect(badge.shadowRoot?.querySelector('span')?.textContent).toBe('Nouveau');
  });

  it.each(['neutral', 'info', 'success', 'warning', 'danger'])(
    'reflects the %s tone for the styles',
    async (tone) => {
      expect((await mount('acs-info-badge', { text: 'x', tone })).getAttribute('tone')).toBe(tone);
    },
  );

  it('is neutral by default', async () => {
    expect((await mount('acs-info-badge', { text: 'x' })).getAttribute('tone')).toBe('neutral');
  });

  it('pairs each coloured tone with the text colour made for it', async () => {
    const css = String(
      (customElements.get('acs-info-badge') as unknown as { styles: unknown[] }).styles
        .map((s) => (s as { cssText: string }).cssText)
        .join('\n'),
    );
    for (const tone of ['success', 'warning', 'danger']) {
      expect(css).toContain(`--acs-color-${tone}`);
      expect(css).toContain(`--acs-color-on-${tone}`);
    }
    expect(css).toContain('--acs-color-on-primary');
  });

  it('shows its text as text, never as markup', async () => {
    const badge = await mount('acs-info-badge', { text: '<b>x</b>' });
    expect(badge.shadowRoot?.querySelector('b')).toBeNull();
  });
});

describe('info.alert', () => {
  it('is an alert that says what kind it is before the message, not by colour alone', async () => {
    const alert = await mount('acs-info-alert', { message: 'Fichier introuvable', tone: 'danger' });
    const region = alert.shadowRoot?.querySelector('[role="alert"]');
    const spoken = region?.textContent?.replace(/\s+/g, ' ').trim();
    expect(spoken).toBe(`${t('text.alert.danger')} Fichier introuvable`);
    expect(region?.querySelector('strong')?.textContent).toBe('Erreur :');
  });

  it.each([
    ['info', 'Information :'],
    ['success', 'Succès :'],
    ['warning', 'Attention :'],
    ['danger', 'Erreur :'],
  ])('starts a %s alert with « %s »', async (tone, lead) => {
    const alert = await mount('acs-info-alert', { message: 'm', tone });
    expect(alert.shadowRoot?.querySelector('strong')?.textContent).toBe(lead);
    expect(alert.getAttribute('tone')).toBe(tone);
  });

  it('is an information by default', async () => {
    const alert = await mount('acs-info-alert', {});
    expect(alert.getAttribute('tone')).toBe('info');
    expect(alert.shadowRoot?.querySelector('strong')?.textContent).toBe('Information :');
  });

  it('shows its message as text, never as markup', async () => {
    const alert = await mount('acs-info-alert', { message: '<img src=x onerror=alert(1)>' });
    expect(alert.shadowRoot?.querySelector('img')).toBeNull();
  });
});
