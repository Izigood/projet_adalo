import { expect, it } from 'vitest';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';

it('boots the Runtime into document.body when the entry point is loaded', async () => {
  document.body.replaceChildren();
  await import('./main.js');
  expect(document.body.querySelector(RUNTIME_ROOT_TAG)).not.toBeNull();
});
