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
