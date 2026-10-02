import { describe, expect, it } from 'vitest';
import { baseTokens, cssVarName, darkTokens, lightTokens, themeCss } from './index.js';

const css = themeCss();

/** Custom properties declared in the first block matching `selector`. */
function declared(selector: RegExp): Record<string, string> {
  const block = selector.exec(css)?.[1];
  if (block === undefined) throw new Error(`block not found: ${selector}`);
  return Object.fromEntries(
    [...block.matchAll(/(--acs-[\w-]+): ([^;]+);/g)].map((m) => [m[1], m[2]]),
  );
}

const expected = (tokens: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(tokens).map(([name, value]) => [cssVarName(name), value]));

const ROOT = /^:root \{([^}]*)\}/m;
const SYSTEM_DARK = /:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/;
const FORCED_DARK = /:root\[data-theme="dark"\] \{([^}]*)\}/;

describe('cssVarName', () => {
  it('prefixes with --acs- and turns dots into dashes', () => {
    expect(cssVarName('color.surface-alt')).toBe('--acs-color-surface-alt');
    expect(cssVarName('space.1')).toBe('--acs-space-1');
  });
});

describe('themeCss', () => {
  it('exposes every base and light token on :root (light is the default)', () => {
    expect(declared(ROOT)).toEqual(expected({ ...baseTokens, ...lightTokens }));
    expect(css).toMatch(/:root \{[^}]*color-scheme: light;/);
  });

  it('applies the dark values both for the system preference and for data-theme="dark"', () => {
    expect(declared(SYSTEM_DARK)).toEqual(expected(darkTokens));
    expect(declared(FORCED_DARK)).toEqual(expected(darkTokens));
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not/);
  });

  it('lets data-theme="light" win over the system dark preference', () => {
    expect(css).toContain(':root:not([data-theme="light"])');
  });

  it('does not repeat mode-independent tokens in the dark blocks', () => {
    for (const block of [declared(SYSTEM_DARK), declared(FORCED_DARK)]) {
      for (const name of Object.keys(baseTokens)) {
        expect(block).not.toHaveProperty(cssVarName(name));
      }
    }
  });

  it('declares each custom property once per block, with a non-empty value', () => {
    for (const block of [ROOT, SYSTEM_DARK, FORCED_DARK]) {
      const text = block.exec(css)?.[1] ?? '';
      const names = [...text.matchAll(/(--acs-[\w-]+):/g)].map((m) => m[1]);
      expect(new Set(names).size).toBe(names.length);
    }
    for (const value of Object.values({ ...baseTokens, ...lightTokens, ...darkTokens })) {
      expect(value.trim()).not.toBe('');
    }
  });
});

describe('light and dark modes', () => {
  const missing = (reference: object, candidate: object): string[] =>
    Object.keys(reference).filter((name) => !(name in candidate));

  it('define exactly the same mode tokens', () => {
    expect(missing(lightTokens, darkTokens)).toEqual([]);
    expect(missing(darkTokens, lightTokens)).toEqual([]);
  });

  it('the parity check detects a token missing from a mode (negative control)', () => {
    const incomplete = Object.fromEntries(
      Object.entries(darkTokens).filter(([name]) => name !== 'color.text'),
    );
    expect(missing(lightTokens, incomplete)).toEqual(['color.text']);
  });
});

describe('themeCss with the theme of a project', () => {
  const surface = cssVarName('color.surface');
  const blocks = (text: string) => ({
    root: /^:root \{([^}]*)\}/m.exec(text)?.[1] ?? '',
    systemDark: /:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(text)?.[1] ?? '',
    forcedDark: /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(text)?.[1] ?? '',
  });
  const value = (block: string, name: string) =>
    new RegExp(`${name}: ([^;]+);`).exec(block)?.[1] ?? null;
  const theme = (parts: {
    tokens?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  }) => ({
    tokens: parts.tokens ?? {},
    modes: { light: parts.light ?? {}, dark: parts.dark ?? {} },
  });

  it('is the default stylesheet when the theme is empty', () => {
    expect(themeCss(theme({}))).toBe(themeCss());
  });

  it('changes the light value of a token', () => {
    const { root } = blocks(themeCss(theme({ light: { 'color.surface': '#fafafa' } })));
    expect(value(root, surface)).toBe('#fafafa');
  });

  it('changes the dark value of a token, in the system and in the forced dark blocks', () => {
    const { systemDark, forcedDark } = blocks(
      themeCss(theme({ dark: { 'color.surface': '#010203' } })),
    );
    expect(value(systemDark, surface)).toBe('#010203');
    expect(value(forcedDark, surface)).toBe('#010203');
  });

  it('applies a common token to both modes, and lets a mode value win over it', () => {
    const common = blocks(themeCss(theme({ tokens: { 'color.surface': '#111111' } })));
    expect(value(common.root, surface)).toBe('#111111');
    expect(value(common.forcedDark, surface)).toBe('#111111');
    expect(value(common.systemDark, surface)).toBe('#111111');

    const both = blocks(
      themeCss(
        theme({ tokens: { 'color.surface': '#111111' }, dark: { 'color.surface': '#222222' } }),
      ),
    );
    expect(value(both.root, surface)).toBe('#111111');
    expect(value(both.forcedDark, surface)).toBe('#222222');
  });

  it('overrides a mode-independent token everywhere', () => {
    const { root, forcedDark } = blocks(themeCss(theme({ tokens: { 'space.1': '9px' } })));
    expect(value(root, cssVarName('space.1'))).toBe('9px');
    expect(forcedDark).not.toContain(cssVarName('space.1'));
  });

  it('adds a token the design system does not know', () => {
    const { root } = blocks(themeCss(theme({ tokens: { 'brand.accent': '#ff00aa' } })));
    expect(value(root, '--acs-brand-accent')).toBe('#ff00aa');
  });

  it('refuses a value that could close the declaration or the rule', () => {
    for (const bad of [
      'red; } body { display: none',
      'a}b',
      'a\nb',
      "url('https://x.test/a.png')",
      'a\\b',
    ]) {
      expect(() => themeCss(theme({ tokens: { 'color.surface': bad } })), bad).toThrow(/unsafe/);
    }
  });

  it('refuses a token name that is not a dotted design token name', () => {
    expect(() => themeCss(theme({ light: { 'x: red; } a {': '#fff' } }))).toThrow(/unsafe/);
  });
});
