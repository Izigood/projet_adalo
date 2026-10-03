import { applyTheme } from '@acs/design-system';
import type { ComponentRegistry, DeprecationNotice } from '@acs/component-sdk';
import type { IdentityProvider } from '@acs/domain';
import type { FileSource } from './boot/file-source.js';
import { RUNTIME_ROOT_TAG } from './runtime-root.js';
import type { RuntimeRoot } from './runtime-root.js';
import type { NodeRenderers, RenderFailure } from './ui/render-page.js';

/** Everything the shell reads at start-up: it is set before the shell joins the page. */
export type MountOptions = {
  /** Where the package comes from; the folder `./project/` next to the page by default. */
  readonly source?: FileSource;
  /** Builds the identity provider for the locale of the project; the local one by default. */
  readonly identity?: (locale: string) => IdentityProvider;
  /** The components the project may use; the base library by default. */
  readonly registry?: ComponentRegistry;
  /** How each component is drawn; by default built from the registry. */
  readonly renderers?: NodeRenderers;
  /** Told about every rendering failure; logs to the console by default. */
  readonly onFailure?: (failure: RenderFailure) => void;
  /** Told about each deprecated component the project uses; warns in the console by default. */
  readonly onWarning?: (notice: DeprecationNotice) => void;
};

/**
 * Applies the base theme (so that even the loading and error screens are styled) and attaches the
 * application shell to `container`; the shell then reads the project and applies its theme.
 */
export function mountRuntime(container: HTMLElement, options: MountOptions = {}): RuntimeRoot {
  applyTheme(container.ownerDocument);
  const root = container.ownerDocument.createElement(RUNTIME_ROOT_TAG);
  if (options.source !== undefined) root.source = options.source;
  if (options.identity !== undefined) root.identity = options.identity;
  if (options.registry !== undefined) root.registry = options.registry;
  if (options.renderers !== undefined) root.renderers = options.renderers;
  if (options.onFailure !== undefined) root.onFailure = options.onFailure;
  if (options.onWarning !== undefined) root.onWarning = options.onWarning;
  container.append(root);
  return root;
}
