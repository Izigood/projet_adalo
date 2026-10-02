// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyTheme, cssVarName, lightTokens } from './index.js';

describe('applyTheme', () => {
  it('adds a stylesheet carrying the design tokens to the document', () => {
    const sheet = applyTheme(document);
    expect(document.adoptedStyleSheets).toContain(sheet);
    const text = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
    expect(text).toContain(cssVarName('color.surface'));
    expect(text).toContain(lightTokens['color.surface']);
  });

  it('adds exactly one stylesheet, however many times it is called', () => {
    const before = document.adoptedStyleSheets.length;
    const first = applyTheme(document);
    const afterFirst = document.adoptedStyleSheets.length;
    expect(applyTheme(document)).toBe(first);
    expect(applyTheme(document)).toBe(first);
    expect(document.adoptedStyleSheets).toHaveLength(afterFirst);
    // Whether the first call happened in this test or in an earlier one, at most one sheet is added.
    expect(afterFirst - before).toBeLessThanOrEqual(1);
    expect(document.adoptedStyleSheets.filter((sheet) => sheet === first)).toHaveLength(1);
  });

  it('replaces the content of the sheet when the theme of a project is applied', () => {
    const doc = document.implementation.createHTMLDocument('themed');
    Object.defineProperty(doc, 'defaultView', { value: window });
    const sheet = applyTheme(doc);
    const text = () => [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
    expect(text()).not.toContain('#abcdef');
    const again = applyTheme(doc, {
      tokens: {},
      modes: { light: { 'color.surface': '#abcdef' }, dark: {} },
    });
    expect(again).toBe(sheet);
    expect(doc.adoptedStyleSheets).toHaveLength(1);
    expect(text()).toContain('#abcdef');
  });
  it('refuses a document that is not attached to a window', () => {
    const detached = document.implementation.createHTMLDocument('detached');
    expect(() => applyTheme(detached)).toThrow(/attached to a window/);
  });
});
