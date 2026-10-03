import { validateProps } from '@acs/component-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE_DEFINITIONS, defineBaseElements } from './index.js';
import { child, mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());

const definition = (id: string) => {
  const found = BASE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no component ${id}`);
  return found;
};

describe('info.card', () => {
  it('is an article named by its title, and shows its children', async () => {
    const card = await mount('acs-info-card', { title: 'Résumé', level: 3 }, [
      child('p', 'Contenu'),
    ]);
    expect(card.shadowRoot?.querySelector('article')?.getAttribute('aria-labelledby')).toBe(
      'title',
    );
    expect(card.shadowRoot?.querySelector('#title')?.textContent).toBe('Résumé');
    expect(card.shadowRoot?.querySelector('slot')).not.toBeNull();
    expect(card.textContent).toBe('Contenu');
  });

  it('has no title and no name when it is not given one', async () => {
    const card = await mount('acs-info-card', {});
    expect(card.shadowRoot?.querySelector('article')?.hasAttribute('aria-labelledby')).toBe(false);
    expect(card.shadowRoot?.querySelector('.title')).toBeNull();
  });

  it.each([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ])('uses a level %i heading', async (level, tag) => {
    const card = await mount('acs-info-card', { title: 'T', level });
    expect(card.shadowRoot?.querySelector('#title')?.tagName).toBe(tag);
  });

  it('shows its title as text, never as markup', async () => {
    const card = await mount('acs-info-card', { title: '<img src=x onerror=alert(1)>' });
    expect(card.shadowRoot?.querySelector('img')).toBeNull();
  });

  it('refuses an empty title and a level out of range', () => {
    const card = definition('info.card');
    expect(validateProps(card, { title: '' }).ok).toBe(false);
    expect(validateProps(card, { level: 1 }).ok).toBe(false);
    expect(validateProps(card, {})).toMatchObject({ ok: true, value: { level: 3 } });
  });
});

describe('info.indicator', () => {
  const text = (element: Element, selector: string) =>
    element.shadowRoot?.querySelector(selector)?.textContent;

  it('is a group named by its label, with the label, the value and the hint', async () => {
    const indicator = await mount('acs-info-indicator', {
      label: 'Commandes ouvertes',
      value: 42,
      hint: 'Depuis lundi',
    });
    expect(indicator.shadowRoot?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Commandes ouvertes',
    );
    expect(text(indicator, '.label')).toBe('Commandes ouvertes');
    expect(text(indicator, '.value')).toBe('42');
    expect(text(indicator, '.hint')).toBe('Depuis lundi');
  });

  it('shows a text value as it is, and zero as zero', async () => {
    expect(
      text(await mount('acs-info-indicator', { label: 'L', value: '12 345 €' }), '.value'),
    ).toBe('12 345 €');
    expect(text(await mount('acs-info-indicator', { label: 'L', value: 0 }), '.value')).toBe('0');
  });

  it('has no hint element without a hint', async () => {
    expect(
      (await mount('acs-info-indicator', { label: 'L', value: 1 })).shadowRoot?.querySelector(
        '.hint',
      ),
    ).toBeNull();
  });

  it.each(['neutral', 'success', 'warning', 'danger'])('reflects the %s tone', async (tone) => {
    expect(
      (await mount('acs-info-indicator', { label: 'L', value: 1, tone })).getAttribute('tone'),
    ).toBe(tone);
  });

  it('shows its texts as text, never as markup', async () => {
    const indicator = await mount('acs-info-indicator', {
      label: '<b>a</b>',
      value: '<i>b</i>',
      hint: '<u>c</u>',
    });
    expect(indicator.shadowRoot?.querySelector('b, i, u')).toBeNull();
  });

  it('accepts a text or a number for its value, nothing else', () => {
    const indicator = definition('info.indicator');
    expect(validateProps(indicator, { label: 'L', value: 'a' }).ok).toBe(true);
    expect(validateProps(indicator, { label: 'L', value: 3 }).ok).toBe(true);
    expect(validateProps(indicator, { label: 'L', value: true }).ok).toBe(false);
    expect(validateProps(indicator, { label: 'L' }).ok).toBe(false);
  });
});

describe('info.progress', () => {
  const bar = (element: Element) => element.shadowRoot?.querySelector('progress');
  const percent = (element: Element) => element.shadowRoot?.querySelector('.percent')?.textContent;

  it('is a progress bar named by its label, with its value and its maximum', async () => {
    const progress = await mount('acs-info-progress', {
      label: 'Import',
      value: 30,
      max: 120,
      showValue: true,
    });
    expect(bar(progress)?.getAttribute('aria-label')).toBe('Import');
    expect(bar(progress)?.getAttribute('value')).toBe('30');
    expect(bar(progress)?.getAttribute('max')).toBe('120');
  });

  it('shows the percentage, rounded', async () => {
    expect(percent(await mount('acs-info-progress', { label: 'x', value: 1, max: 3 }))).toBe(
      '33\u00a0%',
    );
    expect(percent(await mount('acs-info-progress', { label: 'x', value: 2, max: 3 }))).toBe(
      '67\u00a0%',
    );
    expect(percent(await mount('acs-info-progress', { label: 'x', value: 50 }))).toBe('50\u00a0%');
  });

  it('shows a value above the maximum as full, and a negative one as empty', async () => {
    const over = await mount('acs-info-progress', { label: 'x', value: 250, max: 100 });
    expect(bar(over)?.getAttribute('value')).toBe('100');
    expect(percent(over)).toBe('100\u00a0%');
    const under = await mount('acs-info-progress', { label: 'x', value: -5 });
    expect(bar(under)?.getAttribute('value')).toBe('0');
    expect(percent(under)).toBe('0\u00a0%');
  });

  it('falls back to a maximum of 100 when the maximum is not usable', async () => {
    const progress = await mount('acs-info-progress', { label: 'x', value: 10, max: 0 });
    expect(bar(progress)?.getAttribute('max')).toBe('100');
  });

  it('hides the percentage when it is told to', async () => {
    const progress = await mount('acs-info-progress', { label: 'x', value: 10, showValue: false });
    expect(progress.shadowRoot?.querySelector('.percent')).toBeNull();
  });

  it('refuses a negative value, a maximum that is not above zero and an empty label', () => {
    const progress = definition('info.progress');
    expect(validateProps(progress, { label: 'x', value: -1 }).ok).toBe(false);
    expect(validateProps(progress, { label: 'x', max: 0 }).ok).toBe(false);
    expect(validateProps(progress, { label: '' }).ok).toBe(false);
    expect(validateProps(progress, { label: 'x' })).toMatchObject({
      ok: true,
      value: { value: 0, max: 100, showValue: true },
    });
  });
});
