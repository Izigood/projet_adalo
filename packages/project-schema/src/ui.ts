import { UUID_V7_PATTERN } from '@acs/domain';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ComponentReferenceRef, LabelRef, ReadableKeyRef, idOf } from './keys.js';
import { STRICT, discriminated, ref, stringEnum } from './schema-kit.js';
import type { JsonValue } from './schema-kit.js';

/** The three breakpoints of EF-UI-04: mobile below 600 px, tablet 600-1023 px, desktop above. */
export const BREAKPOINTS = ['mobile', 'tablet', 'desktop'] as const;

/**
 * An object whose content a later lot defines (component props: lot 3, bindings: lot 8, events:
 * lot 10). The manifest only requires it to be an object for now (ADR-0028).
 */
const OpenObject = Type.Unsafe<Record<string, JsonValue>>({ type: 'object' });

/** One node of the normalised UI tree: its children are identifiers (dossier 6.2). */
export const UINode = Type.Object(
  {
    id: idOf<'node'>(),
    component: ComponentReferenceRef,
    props: OpenObject,
    responsive: Type.Optional(
      Type.Object(
        {
          mobile: Type.Optional(OpenObject),
          tablet: Type.Optional(OpenObject),
          desktop: Type.Optional(OpenObject),
        },
        STRICT,
      ),
    ),
    bindings: Type.Optional(OpenObject),
    events: Type.Optional(OpenObject),
    visibleWhen: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    children: Type.Array(idOf<'node'>()),
    locked: Type.Optional(Type.Boolean()),
  },
  STRICT,
);

/** `/`, `/orders`, `/orders/:id`: literal segments and `:name` parameters (hash routing, D-06). */
export const PAGE_ROUTE_PATTERN =
  '^/(?:(?:[a-zA-Z0-9_-]+|:[a-z][a-zA-Z0-9]*)(?:/(?:[a-zA-Z0-9_-]+|:[a-z][a-zA-Z0-9]*))*)?$';
export const PageRoute = Type.String({ pattern: PAGE_ROUTE_PATTERN, maxLength: 200 });
const PageRouteRef = ref<typeof PageRoute>('PageRoute');

export const PARAM_TYPES = ['string', 'integer', 'uuid'] as const;

/** A page is allowed to open when its guards pass: a role the user holds, or an expression. */
const PageGuard = discriminated('kind', [
  Type.Object({ kind: Type.Literal('role'), role: ReadableKeyRef }, STRICT),
  Type.Object(
    { kind: Type.Literal('expression'), expr: Type.String({ minLength: 1, maxLength: 2000 }) },
    STRICT,
  ),
]);

export const Page = Type.Object(
  {
    id: idOf<'page'>(),
    key: ReadableKeyRef,
    route: PageRouteRef,
    params: Type.Array(
      Type.Object({ name: ReadableKeyRef, type: stringEnum(PARAM_TYPES) }, STRICT),
    ),
    rootNodeId: idOf<'node'>(),
    guards: Type.Array(PageGuard),
    /** The tree as a map by node id. Whether `rootNodeId` and the children exist is semantic. */
    nodes: Type.Unsafe<Record<string, Static<typeof UINode>>>({
      type: 'object',
      minProperties: 1,
      patternProperties: { [UUID_V7_PATTERN]: { $ref: 'UINode' } },
      additionalProperties: false,
    }),
  },
  STRICT,
);

/** `pages/index.json`: the routes, the page shown first and the menus (dossier 6.1). */
export const PagesIndex = Type.Object(
  {
    routes: Type.Array(Type.Object({ pageId: idOf<'page'>(), route: PageRouteRef }, STRICT)),
    initialPageId: idOf<'page'>(),
    menus: Type.Array(
      Type.Object(
        {
          key: ReadableKeyRef,
          label: LabelRef,
          items: Type.Array(Type.Object({ label: LabelRef, pageId: idOf<'page'>() }, STRICT)),
        },
        STRICT,
      ),
    ),
  },
  STRICT,
);

export type UINode = Static<typeof UINode>;
export type Page = Static<typeof Page>;
export type PagesIndex = Static<typeof PagesIndex>;
