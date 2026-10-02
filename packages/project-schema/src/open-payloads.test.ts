import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { validate } from './index.js';
import type { SchemaName } from './index.js';

/**
 * KNOWN GAP, pinned on purpose (ADR-0028, decision 10 of the lot 1 analysis).
 *
 * The schemas reject a secret wherever the structure is known: an extra `password` property, a
 * `secret` field type, a value next to a secret reference. They cannot see a secret inside a
 * payload whose structure a later lot defines (component props, bindings, events, workflow node
 * parameters, defaults): those only have to be JSON.
 *
 * The deep scan for secrets and token-like strings (SEC-06) is the job of the export and of the
 * validator (lots 12 and 13). When it exists, these expectations must flip deliberately, in the
 * commit that adds it; until then this file states what the manifest does NOT protect against.
 */
const accepts = (name: SchemaName, document: unknown) => validate(name, document).ok;

describe('open payloads are not scanned for secrets yet (SEC-06 deep scan: lots 12 and 13)', () => {
  it('a UI node accepts secret-looking content in props, bindings, events and responsive overrides', () => {
    const node = {
      id: newId<'node'>(),
      component: 'info.title@1',
      props: { password: 'hunter2' },
      bindings: { token: 'abc' },
      events: { apiKey: 'k' },
      responsive: { mobile: { secret: 's' } },
      children: [],
    };
    expect(accepts('UINode', node)).toBe(true);
  });

  it('a field default accepts any JSON value, including one that holds a secret', () => {
    const field = {
      id: newId<'field'>(),
      key: 'note',
      label: 'Note',
      type: 'json',
      required: false,
      classification: 'public',
      default: { password: 'hunter2' },
    };
    expect(accepts('Field', field)).toBe(true);
  });

  it('a workflow accepts anything in node parameters and in variable defaults', () => {
    const start = newId<'workflowNode'>();
    const workflow = {
      id: newId<'workflow'>(),
      key: 'flow',
      trigger: { kind: 'manual' },
      nodes: [{ id: start, type: 'start', params: { apiKey: 'k' } }],
      edges: [],
      variables: [{ name: 'v', type: 'json', default: { token: 't' } }],
      errorPolicy: { retries: 0, timeoutMs: 1000 },
      logLevel: 'none',
    };
    expect(accepts('Workflow', workflow)).toBe(true);
  });

  it('while the structured places still refuse the same words (what the schemas do protect)', () => {
    const field = {
      id: newId<'field'>(),
      key: 'note',
      label: 'Note',
      type: 'string',
      required: false,
      classification: 'public',
    };
    expect(accepts('Field', { ...field, password: 'hunter2' })).toBe(false);
    expect(accepts('Field', { ...field, type: 'secret' })).toBe(false);
    expect(
      accepts('SecretRef', { id: newId<'secretRef'>(), key: 'k', description: '', value: 'v' }),
    ).toBe(false);
  });
});
