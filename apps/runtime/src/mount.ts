import { applyTheme } from '@acs/design-system';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';
import type { RuntimeRoot } from './runtime-root.js';

/** Applies the theme and attaches the application shell to `container`. */
export function mountRuntime(container: HTMLElement): RuntimeRoot {
  applyTheme(container.ownerDocument);
  const root = container.ownerDocument.createElement(RUNTIME_ROOT_TAG);
  container.append(root);
  return root;
}
