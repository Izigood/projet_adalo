import { applyTheme } from '@acs/design-system';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { App } from './app.js';

/** Applies the theme and renders the Studio into `container`. */
export function mountStudio(container: HTMLElement): Root {
  applyTheme(container.ownerDocument);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return root;
}
