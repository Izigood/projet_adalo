import { createLocalProjectStore, requestPersistence } from '@acs/data-repository';
import type { IndexedDbSource, PersistenceState, StorageManagerLike } from '@acs/data-repository';
import type { ProjectStore } from '@acs/domain';
import { createStore } from 'zustand/vanilla';
import { createCatalog } from './catalog/catalog.js';
import type { Catalog } from './catalog/catalog.js';
import { createCommandBus } from './commands/bus.js';
import type { CommandBus } from './commands/bus.js';
import { createProjectSession } from './persistence/session.js';
import type { ProjectSession } from './persistence/session.js';
import { createProjectStore } from './project/project-store.js';
import type { ProjectView } from './project/project-store.js';

/** `unknown` until the browser has answered whether it will keep the data. */
export type PersistenceView = {
  getState(): PersistenceState | 'unknown';
  subscribe(listener: () => void): () => void;
};

/** Everything the interface works with: built once, here, and handed to the components. */
export type StudioServices = {
  /** What a component may do with the open project: look at it. Changes go through the bus. */
  readonly project: { readonly view: ProjectView };
  readonly bus: CommandBus;
  readonly session: ProjectSession;
  readonly catalog: Catalog;
  readonly persistence: PersistenceView;
  /** Asks the browser to keep the data (REC-01) and records its answer in `persistence`. */
  checkPersistence(): Promise<void>;
};

/**
 * What createStudioServices gives back: the services, and the store they were built on. The store
 * is not part of what a component may use (StudioServices): it would let it save without a command.
 * It is there for the tests, and for whoever builds the Studio.
 */
export type StudioKit = StudioServices & { readonly store: ProjectStore };

export type ServicesSource = IndexedDbSource & {
  /** Where the browser's storage manager comes from, unless a test gives another. */
  readonly storage?: StorageManagerLike;
};

/** The services on the browser's own IndexedDB, unless a test gives another. */
export function createStudioServices(source?: ServicesSource): StudioKit {
  const store = createLocalProjectStore(source);
  const { view, writer } = createProjectStore();
  const bus = createCommandBus({ view, writer });
  const session = createProjectSession({ store, bus, view });
  const catalog = createCatalog({ store, flush: session.flush, openId: session.current });
  const persistence = createStore<PersistenceState | 'unknown'>(() => 'unknown');
  // The writer stays here: it is not handed on, so no component can change the project but by a command.
  return {
    store,
    project: { view },
    bus,
    session,
    catalog,
    persistence: { getState: persistence.getState, subscribe: persistence.subscribe },
    checkPersistence: async () =>
      persistence.setState(await requestPersistence(source?.storage), true),
  };
}
