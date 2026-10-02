import { themeCss } from '@acs/design-system';
import type { Theme } from '@acs/project-schema';
import { validate } from '@acs/project-schema';
import { minimalFixture } from '@acs/testing';
import { describe, expect, it } from 'vitest';

/**
 * The manifest validator (project-schema) and the stylesheet builder (design-system) each refuse
 * unsafe token values, and neither can import the other (table 9.2). This is the only place that
 * sees both: it keeps their lists in step, so a value one accepts and the other refuses is caught.
 */
const baseTheme = (): Theme => {
  const files = minimalFixture();
  return files[Object.keys(files).find((path) => path.startsWith('themes/')) as string] as Theme;
};

const schemaAccepts = (value: string): boolean =>
  validate('Theme', { ...baseTheme(), tokens: { 'color.probe': value } }).ok;

const stylesheetAccepts = (value: string): boolean => {
  try {
    themeCss({ tokens: { 'color.probe': value }, modes: { light: {}, dark: {} } });
    return true;
  } catch {
    return false;
  }
};

const REFUSED = [
  'red; color: blue',
  'a}b',
  'a{b',
  'a<b',
  'a>b',
  'a\\b',
  '@import x',
  'red !important',
  'a\nb',
  'a\u0001b',
  '',
  'x'.repeat(201),
  "url('https://x.test/a.png')",
  'URL (x)',
  'image-set(x 1x)',
  'IMAGE-SET (x 1x)',
  'image(x)',
  'cross-fade("https://x.test/a", red 50%)',
  'src(x)',
  'element(#a)',
  'paint(x)',
  'expression(alert(1))',
  'red /* the rest is swallowed',
];

const ACCEPTED = [
  '#ffffff',
  'rgb(0 0 0 / 0.5)',
  'calc(100% - 2rem)',
  'var(--acs-space-2)',
  "system-ui, 'Segoe UI', sans-serif",
  'x'.repeat(200),
];

describe('token value rules of the manifest and of the stylesheet', () => {
  it.each(REFUSED)('both refuse %j', (value) => {
    expect(schemaAccepts(value)).toBe(false);
    expect(stylesheetAccepts(value)).toBe(false);
  });

  it.each(ACCEPTED)('both accept %j', (value) => {
    expect(schemaAccepts(value)).toBe(true);
    expect(stylesheetAccepts(value)).toBe(true);
  });
});
