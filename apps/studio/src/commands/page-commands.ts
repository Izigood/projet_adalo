import { domainError, newId } from '@acs/domain';
import type { DomainError, Id } from '@acs/domain';
import type { Draft } from 'immer';
import { t } from '../i18n.js';
import type { ProjectState } from '../project/project-state.js';
import type { CommandHandler, CommandTable, DesignCommand } from './command.js';

const TITLE_COMPONENT = 'info.title@1';

type Project = Draft<ProjectState>;

const refuse = (message: string, field: string) =>
  domainError('CONSTRAINT_VIOLATION', message, { details: { field } });

/** The page that has this key or this route, apart from `except`: two pages cannot share them. */
function clash(
  draft: Project,
  wanted: { key?: string | undefined; route?: string | undefined },
  except?: Id<'page'>,
): DomainError | undefined {
  for (const page of Object.values(draft.pages.byId)) {
    if (page.id === except) continue;
    if (wanted.key !== undefined && page.key === wanted.key) {
      return refuse(`a page already has the key ${wanted.key}`, 'key');
    }
    if (wanted.route !== undefined && page.route === wanted.route) {
      return refuse(`a page already has the route ${wanted.route}`, 'route');
    }
  }
  return undefined;
}

const unknownPage = (pageId: string) => refuse(`there is no page ${pageId}`, 'pageId');

/** Pages come first in the order of the routes: moving a page moves its route with it. */
function followWithRoutes(draft: Project): void {
  const rank = (pageId: string) => {
    const at = draft.pages.order.indexOf(pageId);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  draft.routes.sort((a, b) => rank(a.pageId) - rank(b.pageId));
}

export type PageAdd = {
  readonly pageId: Id<'page'>;
  readonly nodeId: Id<'node'>;
  readonly key: string;
  readonly route: string;
  /** The text of the title the page starts with. */
  readonly title: string;
};

const add: CommandHandler<PageAdd> = (draft, payload) => {
  if (draft.pages.byId[payload.pageId] !== undefined) {
    return refuse(`there is already a page ${payload.pageId}`, 'pageId');
  }
  const taken = clash(draft, payload);
  if (taken !== undefined) return taken;
  draft.pages.byId[payload.pageId] = {
    id: payload.pageId,
    key: payload.key,
    route: payload.route,
    params: [],
    rootNodeId: payload.nodeId,
    guards: [],
    nodes: {
      [payload.nodeId]: {
        id: payload.nodeId,
        component: TITLE_COMPONENT,
        props: { text: payload.title },
        children: [],
      },
    },
  };
  draft.pages.order.push(payload.pageId);
  draft.routes.push({ pageId: payload.pageId, route: payload.route });
  if (!draft.components.includes(TITLE_COMPONENT)) draft.components.push(TITLE_COMPONENT);
  return undefined;
};

export type PageRename = {
  readonly pageId: Id<'page'>;
  readonly key?: string;
  readonly route?: string;
};

const rename: CommandHandler<PageRename> = (draft, payload) => {
  const page = draft.pages.byId[payload.pageId];
  if (page === undefined) return unknownPage(payload.pageId);
  const taken = clash(draft, payload, payload.pageId);
  if (taken !== undefined) return taken;
  if (payload.key !== undefined) page.key = payload.key;
  if (payload.route !== undefined) {
    page.route = payload.route;
    for (const entry of draft.routes) {
      if (entry.pageId === payload.pageId) entry.route = payload.route;
    }
  }
  return undefined;
};

export type PageRemove = { readonly pageId: Id<'page'> };

const remove: CommandHandler<PageRemove> = (draft, payload) => {
  if (draft.pages.byId[payload.pageId] === undefined) return unknownPage(payload.pageId);
  if (draft.initialPageId === payload.pageId) {
    return domainError('REFERENCE_BLOCKED', 'the page that opens first cannot be removed', {
      details: { referencedBy: 'initialPageId' },
    });
  }
  delete draft.pages.byId[payload.pageId];
  draft.pages.order = draft.pages.order.filter((id) => id !== payload.pageId);
  draft.routes = draft.routes.filter((entry) => entry.pageId !== payload.pageId);
  for (const menu of draft.menus) {
    menu.items = menu.items.filter((item) => item.pageId !== payload.pageId);
  }
  return undefined;
};

export type PageMove = { readonly pageId: Id<'page'>; readonly toIndex: number };

const move: CommandHandler<PageMove> = (draft, payload) => {
  const from = draft.pages.order.indexOf(payload.pageId);
  if (from < 0) return unknownPage(payload.pageId);
  const last = draft.pages.order.length - 1;
  if (!Number.isInteger(payload.toIndex) || payload.toIndex < 0 || payload.toIndex > last) {
    return refuse(`there is no place ${payload.toIndex} among ${last + 1} pages`, 'toIndex');
  }
  draft.pages.order.splice(from, 1);
  draft.pages.order.splice(payload.toIndex, 0, payload.pageId);
  followWithRoutes(draft);
  return undefined;
};

type Generate = <Kind extends string>() => Id<Kind>;

export const pageAdd = (
  spec: Pick<PageAdd, 'key' | 'route' | 'title'>,
  generate: Generate = newId,
): DesignCommand<PageAdd> => ({
  type: 'CMD-PAGE-ADD',
  payload: { ...spec, pageId: generate<'page'>(), nodeId: generate<'node'>() },
  label: t('command.pageAdd'),
});

export const pageRename = (payload: PageRename): DesignCommand<PageRename> => ({
  type: 'CMD-PAGE-RENAME',
  payload,
  label: t('command.pageRename'),
});

export const pageRemove = (payload: PageRemove): DesignCommand<PageRemove> => ({
  type: 'CMD-PAGE-REMOVE',
  payload,
  label: t('command.pageRemove'),
});

export const pageMove = (payload: PageMove): DesignCommand<PageMove> => ({
  type: 'CMD-PAGE-MOVE',
  payload,
  label: t('command.pageMove'),
});

export const PAGE_COMMANDS: CommandTable = {
  'CMD-PAGE-ADD': add as CommandHandler,
  'CMD-PAGE-RENAME': rename as CommandHandler,
  'CMD-PAGE-REMOVE': remove as CommandHandler,
  'CMD-PAGE-MOVE': move as CommandHandler,
};
