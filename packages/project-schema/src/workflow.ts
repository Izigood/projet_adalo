import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { LabelRef, ReadableKeyRef, idOf } from './keys.js';
import { JsonValueSchema, STRICT, discriminated, stringEnum } from './schema-kit.js';
import type { JsonValue } from './schema-kit.js';

/**
 * The 22 node types of the MVP (dossier 4.6). `connectorCall`, `webhook` and the long wait come
 * with lot 15 and later: until then the manifest refuses them.
 */
export const WORKFLOW_NODE_TYPES = [
  // Control
  'start',
  'end',
  'if',
  'switch',
  'foreach',
  'tryCatch',
  // Data
  'get',
  'query',
  'create',
  'update',
  'delete',
  // Interface
  'navigate',
  'notify',
  'confirm',
  'setState',
  // Transformation
  'map',
  'format',
  'calculate',
  'validate',
  // File
  'createExport',
  'attach',
  'download',
] as const;

export const VARIABLE_TYPES = ['string', 'number', 'boolean', 'json'] as const;
export const LOG_LEVELS = ['none', 'error', 'info', 'debug'] as const;

/** Parameters of a node: their shape per type is defined by lot 10 (ADR-0028). */
const OpenObject = Type.Unsafe<Record<string, JsonValue>>({ type: 'object' });

const WorkflowNode = Type.Object(
  {
    id: idOf<'workflowNode'>(),
    type: stringEnum(WORKFLOW_NODE_TYPES),
    label: Type.Optional(LabelRef),
    params: OpenObject,
  },
  STRICT,
);

const Edge = Type.Object(
  {
    id: idOf<'edge'>(),
    from: idOf<'workflowNode'>(),
    to: idOf<'workflowNode'>(),
    /** Which output of a branching node the edge leaves from: `true`, `error`, a case key... */
    branch: Type.Optional(ReadableKeyRef),
  },
  STRICT,
);

const Trigger = discriminated('kind', [
  Type.Object({ kind: Type.Literal('manual') }, STRICT),
  Type.Object({ kind: Type.Literal('event'), event: ReadableKeyRef }, STRICT),
]);

export const Workflow = Type.Object(
  {
    id: idOf<'workflow'>(),
    key: ReadableKeyRef,
    trigger: Trigger,
    nodes: Type.Array(WorkflowNode, { minItems: 1 }),
    edges: Type.Array(Edge),
    variables: Type.Array(
      Type.Object(
        {
          name: ReadableKeyRef,
          type: stringEnum(VARIABLE_TYPES),
          default: Type.Optional(JsonValueSchema),
        },
        STRICT,
      ),
    ),
    errorPolicy: Type.Object(
      {
        retries: Type.Integer({ minimum: 0, maximum: 10 }),
        timeoutMs: Type.Integer({ minimum: 1, maximum: 600_000 }),
      },
      STRICT,
    ),
    logLevel: stringEnum(LOG_LEVELS),
  },
  STRICT,
);

export type Workflow = Static<typeof Workflow>;
