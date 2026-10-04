import { applyTheme } from '@acs/design-system';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { App } from './app.js';
import { createStudioServices } from './services.js';
import type { StudioServices } from './services.js';

/** Applies the theme and renders the Studio into `container`, on the services it is given. */
export function mountStudio(
  container: HTMLElement,
  services: StudioServices = createStudioServices(),
): Root {
  applyTheme(container.ownerDocument);
  void services.checkPersistence();
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
  return root;
}
