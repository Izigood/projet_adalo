import { createLocalProjectStore } from '@acs/data-repository';
import type { IndexedDbSource } from '@acs/data-repository';
import type { ProjectStore } from '@acs/domain';
import { createCatalog } from './catalog/catalog.js';
import type { Catalog } from './catalog/catalog.js';
import { createCommandBus } from './commands/bus.js';
import type { CommandBus } from './commands/bus.js';
import { createProjectSession } from './persistence/session.js';
import type { ProjectSession } from './persistence/session.js';
import { createProjectStore } from './project/project-store.js';
import type { ProjectView } from './project/project-store.js';

/** Everything the interface works with: built once, here, and handed to the components. */
export type StudioServices = {
  readonly store: ProjectStore;
  /** What a component may do with the open project: look at it. Changes go through the bus. */
  readonly project: { readonly view: ProjectView };
  readonly bus: CommandBus;
  readonly session: ProjectSession;
  readonly catalog: Catalog;
};

/** The services on the browser's own IndexedDB, unless a test gives another. */
export function createStudioServices(source?: IndexedDbSource): StudioServices {
  const store = createLocalProjectStore(source);
  const { view, writer } = createProjectStore();
  const bus = createCommandBus({ view, writer });
  const session = createProjectSession({ store, bus, view });
  const catalog = createCatalog({ store, flush: session.flush, openId: session.current });
  // The writer stays here: it is not handed on, so no component can change the project but by a command.
  return { store, project: { view }, bus, session, catalog };
}
