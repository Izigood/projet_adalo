import { beforeEach, describe, expect, it } from 'vitest';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';
import { mountRuntime } from './mount.js';
import fr from './locales/fr.json';

describe('mountRuntime', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('attaches the application shell to the container', () => {
    const root = mountRuntime(document.body);
    expect(root.localName).toBe(RUNTIME_ROOT_TAG);
    expect(document.body.contains(root)).toBe(true);
  });

  it('renders the French labels from locales/fr.json', async () => {
    const root = mountRuntime(document.body);
    await root.updateComplete;
    expect(root.shadowRoot?.querySelector('h1')?.textContent).toBe(fr['runtime.title']);
    expect(root.shadowRoot?.querySelector('p')?.textContent).toBe(fr['runtime.subtitle']);
  });

  it('applies the theme tokens to the document it mounts into', () => {
    mountRuntime(document.body);
    const rules = document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(rules.join('\n')).toContain('--acs-color-surface');
  });
});
