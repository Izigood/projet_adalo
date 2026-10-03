import { describe, expect, it } from 'vitest';
import { darkTokens, lightTokens } from './index.js';
import type { ModeTokenName } from './index.js';

/** WCAG 2.x relative luminance and contrast ratio, test-local (the editor check is lot 7). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

type Pair = readonly [foreground: ModeTokenName, background: ModeTokenName];

const TEXT_PAIRS: readonly Pair[] = [
  ['color.text', 'color.surface'],
  ['color.text', 'color.surface-alt'],
  ['color.text-muted', 'color.surface'],
  ['color.text-muted', 'color.surface-alt'],
  ['color.primary', 'color.surface'],
  ['color.on-primary', 'color.primary'],
  ['color.on-danger', 'color.danger'],
  ['color.on-success', 'color.success'],
  ['color.on-warning', 'color.warning'],
  // Used as the colour of text by the components: the value of an indicator, the border-less error
  // marker of the shell, the links of a menu on its current item.
  ['color.success', 'color.surface'],
  ['color.success', 'color.surface-alt'],
  ['color.warning', 'color.surface'],
  ['color.warning', 'color.surface-alt'],
  ['color.danger', 'color.surface'],
  ['color.danger', 'color.surface-alt'],
  ['color.primary', 'color.surface-alt'],
];

const UI_PAIRS: readonly Pair[] = [
  ['color.border', 'color.surface'],
  ['color.focus', 'color.surface'],
  ['color.focus', 'color.surface-alt'],
];

const modes = { light: lightTokens, dark: darkTokens } as const;

describe('contrast of the base themes (ENF-05: 4.5:1 text, 3:1 interface elements)', () => {
  for (const [mode, tokens] of Object.entries(modes)) {
    const ratio = ([foreground, background]: Pair) =>
      contrast(tokens[foreground], tokens[background]);

    it(`${mode}: text pairs reach 4.5:1`, () => {
      for (const pair of TEXT_PAIRS) {
        expect(ratio(pair), `${mode} ${pair.join(' on ')}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${mode}: interface element pairs reach 3:1`, () => {
      for (const pair of UI_PAIRS) {
        expect(ratio(pair), `${mode} ${pair.join(' on ')}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('the contrast measure rejects low-contrast pairs and matches known WCAG values (negative control)', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#888888')).toBeLessThan(4.5);
  });
});
