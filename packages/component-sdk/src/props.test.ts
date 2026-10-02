import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import { exampleDefinition } from './example-definition.js';
import { sampleProps, validateProps } from './props.js';

const definition = exampleDefinition();
const issues = (result: ReturnType<typeof validateProps>) =>
  result.ok
    ? []
    : (result.error.details as { issues: { path: string }[] }).issues.map((i) => i.path);

describe('validateProps', () => {
  it('accepts valid props and returns them', () => {
    const result = validateProps(definition, { label: 'Envoyer', disabled: true });
    expect(result).toEqual({ ok: true, value: { label: 'Envoyer', disabled: true } });
  });

  it('fills in the defaults of the schema', () => {
    const withDefault = {
      id: 'info.demo',
      propsSchema: Type.Object(
        { text: Type.String(), level: Type.Number({ default: 2 }) },
        { additionalProperties: false },
      ),
    };
    expect(validateProps(withDefault, { text: 'a' })).toEqual({
      ok: true,
      value: { text: 'a', level: 2 },
    });
  });

  it('does not modify the props it is given', () => {
    const withDefault = {
      id: 'info.demo',
      propsSchema: Type.Object(
        { level: Type.Number({ default: 2 }) },
        { additionalProperties: false },
      ),
    };
    const given = Object.freeze({});
    expect(validateProps(withDefault, given).ok).toBe(true);
    expect(given).toEqual({});
  });

  it('refuses a missing required prop, naming its path', () => {
    expect([...new Set(issues(validateProps(definition, {})))]).toEqual(['/props/label']);
  });

  it('refuses a prop of the wrong type and a value that breaks a constraint', () => {
    expect(issues(validateProps(definition, { label: 3 }))).toContain('/props/label');
    expect(issues(validateProps(definition, { label: '' }))).toContain('/props/label');
    expect(issues(validateProps(definition, { label: 'ok', disabled: 'yes' }))).toEqual([
      '/props/disabled',
    ]);
  });

  it('refuses a prop the schema does not know', () => {
    expect(issues(validateProps(definition, { label: 'ok', onclick: 'x' }))).toEqual([
      '/props/onclick',
    ]);
  });

  it('answers MANIFEST_INVALID and names the component', () => {
    const result = validateProps(definition, {});
    expect(!result.ok && result.error.code).toBe('MANIFEST_INVALID');
    expect(!result.ok && result.error.message).toContain('action.example');
  });
});

describe('sampleProps', () => {
  const schema = Type.Object(
    {
      label: Type.String({ minLength: 4 }),
      count: Type.Integer({ minimum: 3 }),
      ratio: Type.Number({ exclusiveMinimum: 1 }),
      flag: Type.Boolean(),
      kind: Type.Union([Type.Literal('a'), Type.Literal('b')]),
      tone: Type.String({ default: 'info' }),
      list: Type.Array(Type.String(), { minItems: 0 }),
      nested: Type.Object({ inner: Type.String() }),
      optional: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  );

  it('gives every required prop a value, and leaves the optional ones out', () => {
    const sample = sampleProps(schema);
    expect(Object.keys(sample).sort()).toEqual(
      ['count', 'flag', 'kind', 'label', 'list', 'nested', 'ratio', 'tone'].sort(),
    );
    expect(sample['tone']).toBe('info');
    expect(sample['kind']).toBe('a');
    expect(sample['nested']).toEqual({ inner: 'Exemple' });
  });

  it('gives values that satisfy the schema', () => {
    const result = validateProps({ id: 'info.sample', propsSchema: schema }, sampleProps(schema));
    expect(result.ok, JSON.stringify(!result.ok && result.error.details)).toBe(true);
  });

  it('satisfies the example definition', () => {
    expect(validateProps(definition, sampleProps(definition.propsSchema)).ok).toBe(true);
  });
});
