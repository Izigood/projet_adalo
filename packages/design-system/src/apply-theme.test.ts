// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyTheme, cssVarName, lightTokens } from './index.js';

describe('applyTheme', () => {
  it('adds one stylesheet carrying the design tokens to the document', () => {
    const before = document.adoptedStyleSheets.length;
    const sheet = applyTheme(document);
    expect(document.adoptedStyleSheets).toHaveLength(before + 1);
    expect(document.adoptedStyleSheets).toContain(sheet);
    const text = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
    expect(text).toContain(cssVarName('color.surface'));
    expect(text).toContain(lightTokens['color.surface']);
  });

  it('is idempotent for the same document', () => {
    const first = applyTheme(document);
    const count = document.adoptedStyleSheets.length;
    expect(applyTheme(document)).toBe(first);
    expect(document.adoptedStyleSheets).toHaveLength(count);
  });

  it('refuses a document that is not attached to a window', () => {
    const detached = document.implementation.createHTMLDocument('detached');
    expect(() => applyTheme(detached)).toThrow(/attached to a window/);
  });
});
