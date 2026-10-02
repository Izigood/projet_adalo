import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import fr from './locales/fr.json';
import { mountStudio } from './mount.js';

// Tell React this environment supports act(), so renders are flushed deterministically.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('mountStudio', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  async function mount() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = await act(async () => mountStudio(container));
    return { container, root };
  }

  it('renders the French labels from locales/fr.json', async () => {
    const { container } = await mount();
    expect(container.querySelector('h1')?.textContent).toBe(fr['studio.title']);
    expect(container.querySelector('p')?.textContent).toBe(fr['studio.subtitle']);
  });

  it('applies the design tokens to the document', async () => {
    await mount();
    const rules = document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(rules.join('\n')).toContain('--acs-color-surface');
  });

  it('removes the interface when the root is unmounted', async () => {
    const { container, root } = await mount();
    await act(async () => root.unmount());
    expect(container.querySelector('h1')).toBeNull();
  });
});
