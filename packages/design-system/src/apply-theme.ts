import { themeCss } from './css.js';
import type { ThemeOverrides } from './css.js';

const sheets = new WeakMap<Document, CSSStyleSheet>();

/**
 * Exposes the design tokens as CSS custom properties on a document. A constructable stylesheet is
 * used instead of a <style> element so it works under a strict CSP (no 'unsafe-inline').
 * Idempotent: calling it again on the same document keeps one sheet; passing the theme of a
 * project replaces its content, so the project's tokens are what the document shows.
 */
export function applyTheme(doc: Document, overrides?: ThemeOverrides): CSSStyleSheet {
  const existing = sheets.get(doc);
  if (existing !== undefined) {
    if (overrides !== undefined) existing.replaceSync(themeCss(overrides));
    return existing;
  }
  const view = doc.defaultView;
  if (view === null) throw new Error('applyTheme needs a document attached to a window');
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(themeCss(overrides));
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  sheets.set(doc, sheet);
  return sheet;
}
