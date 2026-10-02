import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import { deprecationNotices } from './deprecation.js';
import { exampleDefinition } from './example-definition.js';
import { planMigration } from './migration.js';
import { createRegistry } from './registry.js';

const schema = (...names: string[]) =>
  Type.Object(Object.fromEntries(names.map((name) => [name, Type.String()])), {
    additionalProperties: false,
  });

/** `action.example` in three majors: @1 and @2 deprecated, @3 current, with the steps to get there. */
function registry() {
  const registry = createRegistry();
  const v1 = exampleDefinition({
    propsSchema: schema('title'),
    accessibility: {
      role: 'button',
      nameFrom: 'prop:title',
      keyboard: ['Enter'],
      requiredProps: ['title'],
    },
    responsive: [],
    deprecated: { since: '2.0.0', replacement: 'action.example@2' },
  });
  const v2 = exampleDefinition({
    version: '2.0.0',
    tag: 'acs-action-example-v2',
    propsSchema: schema('label'),
    responsive: [],
    deprecated: { since: '3.0.0', replacement: 'action.example@3' },
    migrations: [
      {
        from: 1,
        to: 2,
        description: 'title becomes label',
        migrate: ({ title, ...rest }) => ({ ...rest, label: title }),
      },
    ],
  });
  const v3 = exampleDefinition({
    version: '3.0.0',
    tag: 'acs-action-example-v3',
    propsSchema: schema('label', 'tone'),
    responsive: [],
    migrations: [
      {
        from: 1,
        to: 2,
        description: 'title becomes label',
        migrate: ({ title, ...rest }) => ({ ...rest, label: title }),
      },
      {
        from: 2,
        to: 3,
        description: 'tone is added',
        migrate: (props) => ({ ...props, tone: 'info' }),
      },
    ],
  });
  for (const definition of [v1, v2, v3]) {
    const result = registry.register(definition);
    if (!result.ok) throw new Error(JSON.stringify(result.error.details));
  }
  return registry;
}

describe('registry.versionsOf', () => {
  it('lists the majors of a component, oldest first, whatever the registration order', () => {
    const r = createRegistry();
    r.register(exampleDefinition({ version: '2.0.0', tag: 'acs-action-example-v2' }));
    r.register(exampleDefinition());
    expect(r.versionsOf('action.example').map((d) => d.version)).toEqual(['1.0.0', '2.0.0']);
    expect(r.versionsOf('action.nope')).toEqual([]);
  });
});

describe('deprecationNotices (EF-CMP-03)', () => {
  it('reports each deprecated reference once, with its replacement', () => {
    const notices = deprecationNotices(registry(), [
      'action.example@1',
      'action.example@1',
      'action.example@2',
      'action.example@3',
      'action.unknown@1',
    ]);
    expect(notices).toEqual([
      { ref: 'action.example@1', since: '2.0.0', replacement: 'action.example@2' },
      { ref: 'action.example@2', since: '3.0.0', replacement: 'action.example@3' },
    ]);
  });

  it('reports nothing for current components, and omits a replacement that is not declared', () => {
    expect(deprecationNotices(registry(), ['action.example@3'])).toEqual([]);
    const r = createRegistry();
    r.register(exampleDefinition({ deprecated: { since: '1.1.0' } }));
    expect(deprecationNotices(r, ['action.example@1'])).toEqual([
      { ref: 'action.example@1', since: '1.1.0' },
    ]);
  });
});

describe('planMigration (EF-CMP-03)', () => {
  it('shows what one step changes, and keeps the props it started from', () => {
    const plan = planMigration(registry(), 'action.example@2', { label: 'Go' });
    expect(plan).toMatchObject({
      ok: true,
      value: {
        from: 'action.example@2',
        to: 'action.example@3',
        before: { label: 'Go' },
        after: { label: 'Go', tone: 'info' },
        changes: [{ kind: 'added', prop: 'tone', after: 'info' }],
      },
    });
  });

  it('chains the steps up to the latest major', () => {
    const plan = planMigration(registry(), 'action.example@1', { title: 'Go' });
    expect(plan.ok && plan.value.after).toEqual({ label: 'Go', tone: 'info' });
    expect(plan.ok && plan.value.changes).toEqual([
      { kind: 'removed', prop: 'title', before: 'Go' },
      { kind: 'added', prop: 'label', after: 'Go' },
      { kind: 'added', prop: 'tone', after: 'info' },
    ]);
  });

  it('reports a changed value as changed', () => {
    const r = createRegistry();
    r.register(exampleDefinition({ id: 'action.same', tag: 'acs-action-same' }));
    r.register(
      exampleDefinition({
        id: 'action.same',
        version: '2.0.0',
        tag: 'acs-action-same-v2',
        migrations: [
          {
            from: 1,
            to: 2,
            description: 'upper case',
            migrate: ({ label }) => ({ label: String(label).toUpperCase() }),
          },
        ],
      }),
    );
    const plan = planMigration(r, 'action.same@1', { label: 'go' });
    expect(plan.ok && plan.value.changes).toEqual([
      { kind: 'changed', prop: 'label', before: 'go', after: 'GO' },
    ]);
  });

  it('is a plan with no change when the reference is already the latest', () => {
    const plan = planMigration(registry(), 'action.example@3', { label: 'Go', tone: 'info' });
    expect(plan.ok && plan.value.changes).toEqual([]);
    expect(plan.ok && plan.value.to).toBe('action.example@3');
  });

  it('never modifies the props it is given, nor lets a step do it', () => {
    const given = Object.freeze({ title: 'Go' });
    expect(planMigration(registry(), 'action.example@1', given).ok).toBe(true);
    expect(given).toEqual({ title: 'Go' });
    const r = createRegistry();
    r.register(exampleDefinition({ id: 'action.greedy', tag: 'acs-action-greedy' }));
    r.register(
      exampleDefinition({
        id: 'action.greedy',
        version: '2.0.0',
        tag: 'acs-action-greedy-v2',
        migrations: [
          {
            from: 1,
            to: 2,
            description: 'mutates its input',
            migrate: (props) => {
              (props as Record<string, unknown>)['label'] = 'changed in place';
              return props;
            },
          },
        ],
      }),
    );
    const plan = planMigration(r, 'action.greedy@1', { label: 'kept' });
    expect(plan.ok && plan.value.before).toEqual({ label: 'kept' });
  });

  it('refuses a migration whose result breaks the schema of the latest major', () => {
    const plan = planMigration(registry(), 'action.example@1', { name: 'wrong prop' });
    expect(!plan.ok && plan.error.code).toBe('MANIFEST_INVALID');
  });

  it('refuses a reference that is unknown, malformed or without a path to the latest major', () => {
    expect(!planMigration(registry(), 'action.nope@1', {}).ok).toBe(true);
    expect(!planMigration(registry(), 'nonsense', {}).ok).toBe(true);
    const r = createRegistry();
    r.register(exampleDefinition({ id: 'action.gap', tag: 'acs-action-gap' }));
    r.register(exampleDefinition({ id: 'action.gap', version: '2.0.0', tag: 'acs-action-gap-v2' }));
    const gap = planMigration(r, 'action.gap@1', { label: 'x' });
    expect(!gap.ok && gap.error.message).toContain('no migration');
  });
});
