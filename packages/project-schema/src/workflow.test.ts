import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { LOG_LEVELS, VARIABLE_TYPES, WORKFLOW_NODE_TYPES, validate } from './index.js';
import type { Issue, SchemaName } from './index.js';

/** The MVP node types of dossier 4.6, written out independently of the schema. */
const DOSSIER_NODE_TYPES = [
  'start',
  'end',
  'if',
  'switch',
  'foreach',
  'tryCatch',
  'get',
  'query',
  'create',
  'update',
  'delete',
  'navigate',
  'notify',
  'confirm',
  'setState',
  'map',
  'format',
  'calculate',
  'validate',
  'createExport',
  'attach',
  'download',
];

const without = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

function issuesOf(name: SchemaName, document: unknown): string[] {
  const result = validate(name, document);
  if (result.ok) return [];
  return (result.error.details as { issues: Issue[] }).issues.map(
    (issue) => `${issue.keyword} ${issue.path}`,
  );
}

const startId = newId<'workflowNode'>();
const endId = newId<'workflowNode'>();

const workflow = (extra: Record<string, unknown> = {}) => ({
  id: newId<'workflow'>(),
  key: 'approveOrder',
  trigger: { kind: 'manual' },
  nodes: [
    { id: startId, type: 'start', params: {} },
    { id: endId, type: 'end', params: {} },
  ],
  edges: [{ id: newId<'edge'>(), from: startId, to: endId }],
  variables: [],
  errorPolicy: { retries: 2, timeoutMs: 30_000 },
  logLevel: 'info',
  ...extra,
});

const node = (extra: Record<string, unknown> = {}) => ({
  id: newId<'workflowNode'>(),
  type: 'start',
  params: {},
  ...extra,
});

describe('workflow node types (dossier 4.6)', () => {
  it('are the 22 types of the MVP, nothing more', () => {
    expect([...WORKFLOW_NODE_TYPES].sort()).toEqual([...DOSSIER_NODE_TYPES].sort());
    expect(WORKFLOW_NODE_TYPES).toHaveLength(22);
  });

  it.each(WORKFLOW_NODE_TYPES)('accepts a %s node', (type) => {
    expect(issuesOf('Workflow', workflow({ nodes: [node({ type })] }))).toEqual([]);
  });

  it('refuses the post-MVP nodes: connector call, webhook and long wait', () => {
    for (const type of ['connectorCall', 'webhook', 'wait', 'Start', '']) {
      expect(issuesOf('Workflow', workflow({ nodes: [node({ type })] }))).toEqual([
        'enum /nodes/0/type',
      ]);
    }
  });
});

describe('workflow', () => {
  it('accepts a complete workflow with a branch, variables and an event trigger', () => {
    const decide = newId<'workflowNode'>();
    const document = workflow({
      trigger: { kind: 'event', event: 'orderCreated' },
      nodes: [
        { id: startId, type: 'start', label: 'Début', params: {} },
        { id: decide, type: 'if', params: { condition: 'record.amount > 1000' } },
        { id: endId, type: 'end', params: {} },
      ],
      edges: [
        { id: newId<'edge'>(), from: startId, to: decide },
        { id: newId<'edge'>(), from: decide, to: endId, branch: 'true' },
      ],
      variables: [
        { name: 'total', type: 'number', default: 0 },
        { name: 'note', type: 'string' },
      ],
    });
    expect(issuesOf('Workflow', document)).toEqual([]);
  });

  it('knows the manual and event triggers, and refuses any other at the trigger itself', () => {
    expect(issuesOf('Workflow', workflow({ trigger: { kind: 'event' } }))).toEqual([
      'required /trigger/event',
    ]);
    for (const trigger of [{ kind: 'schedule', cron: '* * * * *' }, { kind: 'webhook' }, {}]) {
      expect(issuesOf('Workflow', workflow({ trigger }))).toEqual(['discriminator /trigger']);
    }
  });

  it('needs at least one node', () => {
    expect(issuesOf('Workflow', workflow({ nodes: [] }))).toEqual(['minItems /nodes']);
  });

  it('designates nodes in edges by identifier, never by label', () => {
    const edge = { id: newId<'edge'>(), from: 'start', to: 'end' };
    expect(issuesOf('Workflow', workflow({ edges: [edge] }))).toEqual([
      'pattern /edges/0/from',
      'pattern /edges/0/to',
    ]);
    expect(
      issuesOf(
        'Workflow',
        workflow({ edges: [{ id: newId<'edge'>(), from: startId, to: endId, branch: 'Yes' }] }),
      ),
    ).toEqual(['pattern /edges/0/branch']);
  });

  it('requires the parameters of a node to be an object and refuses other node properties', () => {
    expect(issuesOf('Workflow', workflow({ nodes: [node({ params: 'x' })] }))).toEqual([
      'type /nodes/0/params',
    ]);
    expect(issuesOf('Workflow', workflow({ nodes: [without(node(), 'params')] }))).toEqual([
      'required /nodes/0/params',
    ]);
    expect(issuesOf('Workflow', workflow({ nodes: [node({ script: 'x' })] }))).toEqual([
      'additionalProperties /nodes/0/script',
    ]);
  });

  it('accepts the four variable types and the four log levels, and nothing else', () => {
    for (const type of VARIABLE_TYPES) {
      expect(issuesOf('Workflow', workflow({ variables: [{ name: 'v', type }] }))).toEqual([]);
    }
    expect(issuesOf('Workflow', workflow({ variables: [{ name: 'v', type: 'date' }] }))).toEqual([
      'enum /variables/0/type',
    ]);
    for (const logLevel of LOG_LEVELS) {
      expect(issuesOf('Workflow', workflow({ logLevel }))).toEqual([]);
    }
    expect(issuesOf('Workflow', workflow({ logLevel: 'trace' }))).toEqual(['enum /logLevel']);
  });

  it('bounds the error policy: 0 to 10 retries, a timeout of 1 ms to 10 minutes', () => {
    const policy = (retries: number, timeoutMs: number) =>
      workflow({ errorPolicy: { retries, timeoutMs } });
    expect(issuesOf('Workflow', policy(0, 1))).toEqual([]);
    expect(issuesOf('Workflow', policy(10, 600_000))).toEqual([]);
    expect(issuesOf('Workflow', policy(-1, 1000))).toEqual(['minimum /errorPolicy/retries']);
    expect(issuesOf('Workflow', policy(11, 1000))).toEqual(['maximum /errorPolicy/retries']);
    expect(issuesOf('Workflow', policy(1, 0))).toEqual(['minimum /errorPolicy/timeoutMs']);
    expect(issuesOf('Workflow', policy(1, 600_001))).toEqual(['maximum /errorPolicy/timeoutMs']);
    expect(issuesOf('Workflow', policy(1.5, 1000))).toEqual(['type /errorPolicy/retries']);
  });

  it('requires every attribute and refuses other properties, such as a password', () => {
    for (const name of [
      'id',
      'key',
      'trigger',
      'nodes',
      'edges',
      'variables',
      'errorPolicy',
      'logLevel',
    ]) {
      expect(issuesOf('Workflow', without(workflow(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('Workflow', workflow({ password: 'x' }))).toEqual([
      'additionalProperties /password',
    ]);
    expect(issuesOf('Workflow', workflow({ key: 'Approve' }))).toEqual(['pattern /key']);
  });
});
