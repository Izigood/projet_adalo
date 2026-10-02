import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import type { ComponentDefinition } from './definition.js';
import { exampleDefinition } from './example-definition.js';
import { createRegistry } from './registry.js';
import { definitionIssues, expectedTag, validateDefinition } from './validate-definition.js';

const paths = (definition: ComponentDefinition) =>
  definitionIssues(definition).map((issue) => issue.path);

describe('definitionIssues', () => {
  it('accepts a valid definition', () => {
    expect(definitionIssues(exampleDefinition())).toEqual([]);
  });

  // One case per rule: removing the rule must fail exactly its case (REC-10).
  const cases: [string, Partial<ComponentDefinition>, string][] = [
    ['an id without a family', { id: 'example' }, '/id'],
    ['an id with an upper-case family', { id: 'Action.example' }, '/id'],
    ['a family that is not the category', { id: 'info.example', tag: 'acs-action-example' }, '/id'],
    ['an unknown category', { category: 'misc' as never }, '/category'],
    ['a version that is not SemVer', { version: '1.0' }, '/version'],
    ['a tag that does not follow the id', { tag: 'my-button' }, '/tag'],
    ['a major 2 tag without the version', { version: '2.0.0' }, '/tag'],
    [
      'props that are not an object schema',
      { propsSchema: Type.String() as never },
      '/propsSchema',
    ],
    [
      'a props schema that lets unknown props through',
      { propsSchema: Type.Object({ label: Type.String() }) },
      '/propsSchema/additionalProperties',
    ],
    [
      'a prop whose name is not camelCase',
      { propsSchema: Type.Object({ 'Bad-name': Type.String() }, { additionalProperties: false }) },
      '/propsSchema/properties/Bad-name',
    ],
    [
      'an event with a bad name',
      { events: [{ name: 'Press-It', description: 'x' }] },
      '/events/0/name',
    ],
    [
      'a duplicate event',
      {
        events: [
          { name: 'press', description: 'a' },
          { name: 'press', description: 'b' },
        ],
      },
      '/events/1/name',
    ],
    [
      'an event without a description',
      { events: [{ name: 'press', description: ' ' }] },
      '/events/0/description',
    ],
    ['a slot with a bad max', { slots: [{ name: 'default', max: 0 }] }, '/slots/0/max'],
    ['a duplicate slot', { slots: [{ name: 'default' }, { name: 'default' }] }, '/slots/1/name'],
    [
      'a binding to a prop that does not exist',
      { bindings: [{ prop: 'nope', kind: 'value' }] },
      '/bindings/0/prop',
    ],
    ['an unknown capability', { capabilities: ['root' as never] }, '/capabilities/0'],
    ['a duplicate capability', { capabilities: ['data.read', 'data.read'] }, '/capabilities/1'],
    [
      'a role that is empty',
      { accessibility: { ...exampleDefinition().accessibility, role: '' } },
      '/accessibility/role',
    ],
    [
      'a role that is not an ARIA role',
      { accessibility: { ...exampleDefinition().accessibility, role: 'clickable' } },
      '/accessibility/role',
    ],
    [
      'an interactive role without keyboard keys',
      { accessibility: { ...exampleDefinition().accessibility, keyboard: [] } },
      '/accessibility/keyboard',
    ],
    [
      'a keyboard key that is blank',
      { accessibility: { ...exampleDefinition().accessibility, keyboard: ['Enter', ' '] } },
      '/accessibility/keyboard/1',
    ],
    [
      'a name source that is neither content nor a prop',
      { accessibility: { ...exampleDefinition().accessibility, nameFrom: 'magic' } },
      '/accessibility/nameFrom',
    ],
    [
      'a name taken from a prop that does not exist',
      { accessibility: { ...exampleDefinition().accessibility, nameFrom: 'prop:title' } },
      '/accessibility/nameFrom',
    ],
    [
      'a name taken from a prop that is optional',
      { accessibility: { ...exampleDefinition().accessibility, nameFrom: 'prop:disabled' } },
      '/accessibility/nameFrom',
    ],
    [
      'a required prop that the schema does not require',
      { accessibility: { ...exampleDefinition().accessibility, requiredProps: ['disabled'] } },
      '/accessibility/requiredProps/0',
    ],
    ['a responsive prop that does not exist', { responsive: ['columns'] }, '/responsive/0'],
    [
      'a migration that skips a version',
      {
        version: '3.0.0',
        tag: 'acs-action-example-v3',
        migrations: [{ from: 1, to: 3, description: 'x', migrate: (props) => props }],
      },
      '/migrations/0/to',
    ],
    [
      'a migration beyond the current version',
      { migrations: [{ from: 1, to: 2, description: 'x', migrate: (props) => props }] },
      '/migrations/0/to',
    ],
    [
      'a deprecation without a SemVer date',
      { deprecated: { since: 'yesterday' } },
      '/deprecated/since',
    ],
    [
      'a replacement that is not a reference',
      { deprecated: { since: '1.1.0', replacement: 'the other one' } },
      '/deprecated/replacement',
    ],
  ];

  it.each(cases)('refuses %s', (_name, overrides, path) => {
    expect(paths(exampleDefinition(overrides))).toContain(path);
  });

  it('accepts a component without keyboard keys when its role is not interactive', () => {
    const passive = exampleDefinition({
      id: 'info.example',
      category: 'info',
      tag: 'acs-info-example',
      accessibility: { role: 'note', nameFrom: 'content', keyboard: [], requiredProps: [] },
    });
    expect(definitionIssues(passive)).toEqual([]);
  });

  it('reports every fault at once', () => {
    const issues = definitionIssues(
      exampleDefinition({ version: 'x', events: [], responsive: ['a'] }),
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('expectedTag', () => {
  it('turns the name into kebab case and adds the major from the second one', () => {
    expect(
      expectedTag({ id: 'structure.sidePanel', category: 'structure', version: '1.0.0' }),
    ).toBe('acs-structure-side-panel');
    expect(expectedTag({ id: 'structure.tabs', category: 'structure', version: '2.1.0' })).toBe(
      'acs-structure-tabs-v2',
    );
  });
});

describe('validateDefinition', () => {
  it('answers COMPONENT_INVALID, naming the component and the property', () => {
    const result = validateDefinition(exampleDefinition({ version: '1.0' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COMPONENT_INVALID');
    expect(result.error.message).toContain('action.example');
    expect(result.error.details).toMatchObject({
      issues: [{ component: 'action.example', path: '/version' }],
    });
  });
});

describe('createRegistry', () => {
  it('registers a valid definition and resolves it by its reference', () => {
    const registry = createRegistry();
    const definition = exampleDefinition();
    expect(registry.register(definition).ok).toBe(true);
    expect(registry.resolve('action.example@1')).toBe(definition);
    expect(registry.definitions()).toEqual([definition]);
  });

  it('refuses an invalid definition and stays unchanged', () => {
    const registry = createRegistry();
    const result = registry.register(exampleDefinition({ tag: 'wrong' }));
    expect(!result.ok && result.error.code).toBe('COMPONENT_INVALID');
    expect(registry.definitions()).toEqual([]);
    expect(registry.resolve('action.example@1')).toBeUndefined();
  });

  it('refuses the same id and major twice', () => {
    const registry = createRegistry();
    registry.register(exampleDefinition());
    const again = registry.register(exampleDefinition({ version: '1.2.0' }));
    expect(!again.ok && again.error.details).toMatchObject({
      issues: [{ path: '/id', message: expect.stringContaining('already registered') }],
    });
  });

  it('lets two majors of one component coexist, each with its own tag', () => {
    const registry = createRegistry();
    const v1 = exampleDefinition({
      deprecated: { since: '2.0.0', replacement: 'action.example@2' },
    });
    const v2 = exampleDefinition({ version: '2.0.0', tag: 'acs-action-example-v2' });
    expect(registry.register(v1).ok).toBe(true);
    expect(registry.register(v2).ok).toBe(true);
    expect(registry.resolve('action.example@1')).toBe(v1);
    expect(registry.resolve('action.example@2')).toBe(v2);
  });

  it('refuses a tag that another component already owns', () => {
    const registry = createRegistry();
    registry.register(exampleDefinition());
    const clash = registry.register(
      exampleDefinition({ id: 'action.other', version: '1.0.0', tag: 'acs-action-example' }),
    );
    expect(!clash.ok).toBe(true);
  });

  it('resolves nothing for an unknown reference, a wrong major or a malformed one', () => {
    const registry = createRegistry();
    registry.register(exampleDefinition());
    for (const ref of ['action.nope@1', 'action.example@2', 'action.example', '', '__proto__@1']) {
      expect(registry.resolve(ref), ref).toBeUndefined();
    }
  });

  it('lists definitions in registration order', () => {
    const registry = createRegistry();
    const a = exampleDefinition();
    const b = exampleDefinition({ id: 'action.second', tag: 'acs-action-second' });
    registry.register(a);
    registry.register(b);
    expect(registry.definitions()).toEqual([a, b]);
  });
});
