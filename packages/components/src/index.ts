import { createRegistry } from '@acs/component-sdk';
import type { ComponentDefinition, ComponentRegistry } from '@acs/component-sdk';
import { defineElements } from './base/define.js';
import type { BaseComponent } from './base/define.js';
import fr from './locales/fr.json';
import { navigationBackButton } from './navigation/back-button.js';
import { navigationBreadcrumb } from './navigation/breadcrumb.js';
import { navigationLink } from './navigation/link.js';
import { navigationMenu } from './navigation/menu.js';
import { navigationTabBar } from './navigation/tab-bar.js';
import { structureAccordion } from './structure/accordion.js';
import { structureGrid } from './structure/grid.js';
import { structurePage } from './structure/page.js';
import { structureSection } from './structure/section.js';
import { structureSidePanel } from './structure/side-panel.js';
import { structureStack } from './structure/stack.js';
import { structureTabs } from './structure/tabs.js';

export const PACKAGE_NAME = '@acs/components';

/** The base library, in the order of the dossier (§ 4.5). */
export const BASE_COMPONENTS: readonly BaseComponent[] = [
  structurePage,
  structureSection,
  structureStack,
  structureGrid,
  structureTabs,
  structureSidePanel,
  structureAccordion,
  navigationMenu,
  navigationTabBar,
  navigationBreadcrumb,
  navigationBackButton,
  navigationLink,
];

export const BASE_DEFINITIONS: readonly ComponentDefinition[] = BASE_COMPONENTS.map(
  (component) => component.definition,
);

/** Defines the custom elements of the base library (once; calling again is harmless). */
export function defineBaseElements(): void {
  defineElements(BASE_COMPONENTS);
}

/** A registry holding the base library. Registration is validated, so a bad definition throws. */
export function createBaseRegistry(): ComponentRegistry {
  const registry = createRegistry();
  for (const { definition } of BASE_COMPONENTS) {
    const result = registry.register(definition);
    if (!result.ok) throw new Error(JSON.stringify(result.error.details));
  }
  return registry;
}

/** The French name of a component in the palette of the Studio (ENF-10). */
export function paletteLabel(id: string): string | undefined {
  return (fr as Record<string, string>)[`component.${id}`];
}

export { MAX_COLUMNS } from './structure/grid.js';
export type { BaseComponent } from './base/define.js';
