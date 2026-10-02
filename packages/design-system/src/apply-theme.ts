import { themeCss } from './css.js';

const sheets = new WeakMap<Document, CSSStyleSheet>();

/**
 * Exposes the design tokens as CSS custom properties on a document. A constructable stylesheet is
 * used instead of a <style> element so it works under a strict CSP (no 'unsafe-inline').
 * Idempotent: calling it again on the same document does not add a second sheet.
 */
export function applyTheme(doc: Document): CSSStyleSheet {
  const existing = sheets.get(doc);
  if (existing !== undefined) return existing;
  const view = doc.defaultView;
  if (view === null) throw new Error('applyTheme needs a document attached to a window');
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(themeCss());
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  sheets.set(doc, sheet);
  return sheet;
}
