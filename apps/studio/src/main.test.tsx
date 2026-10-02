import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from './locales/fr.json';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio entry point', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
  });

  it('boots the Studio into #root', async () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.append(host);
    await act(async () => {
      await import('./main.js');
    });
    expect(host.querySelector('h1')?.textContent).toBe(fr['studio.title']);
  });

  it('fails loudly when #root is missing from the page', async () => {
    await expect(import('./main.js')).rejects.toThrow(/#root is missing/);
  });
});
