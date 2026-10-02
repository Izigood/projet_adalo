import { afterEach, expect, it, vi } from 'vitest';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';
import type { RuntimeRoot } from './runtime-root.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('boots the Runtime into document.body and reads the project from ./project/', async () => {
  const fetchFile = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 404 })));
  vi.stubGlobal('fetch', fetchFile);
  document.body.replaceChildren();
  await import('./main.js');
  const root = document.body.querySelector<RuntimeRoot>(RUNTIME_ROOT_TAG);
  expect(root).not.toBeNull();
  await root?.settled;
  expect(String(fetchFile.mock.calls[0]?.[0])).toMatch(/\/project\/project\.json$/);
});
