import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, validate } from './index.js';
import type { FieldType, Issue } from './index.js';

/** The 13 types of dossier 6.3, written out independently of the schema. */
const DOSSIER_TYPES = [
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'choice',
  'multiChoice',
  'reference',
  'file',
  'image',
  'json',
];

/** The object without one property (a destructuring would leave an unused variable). */
const without = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

const field = (type: string, extra: Record<string, unknown> = {}) => ({
  id: newId<'field'>(),
  key: 'dueDate',
  label: 'Échéance',
  required: true,
  classification: 'interne',
  type,
  ...extra,
});

/** A valid document of each type, with the options the type needs. */
const VALID: Record<FieldType, Record<string, unknown>> = {
  string: { options: { maxLength: 100, pattern: '^[A-Z]+$' } },
  text: { options: { maxLength: 10_000 } },
  integer: { options: { min: 0, max: 100 } },
  decimal: { options: { precision: 12, scale: 2 }, default: '0.00' },
  boolean: { options: { nullable: true } },
  date: {},
  datetime: {},
  choice: { options: { source: { kind: 'list', values: [{ value: 'open', label: 'Ouvert' }] } } },
  multiChoice: {
    options: { source: { kind: 'dictionary', entity: newId<'entity'>() }, min: 1, max: 3 },
  },
  reference: { options: { target: newId<'entity'>() } },
  file: { options: { accept: ['application/pdf'], maxSizeBytes: 1_048_576 } },
  image: { options: { accept: ['image/png'], maxSizeBytes: 524_288 } },
  json: { options: { schema: { type: 'object' } } },
};

function issuesOf(document: unknown): string[] {
  const result = validate('Field', document);
  if (result.ok) return [];
  return (result.error.details as { issues: Issue[] }).issues.map(
    (issue) => `${issue.keyword} ${issue.path}`,
  );
}

describe('field types (dossier 6.3)', () => {
  it('are exactly the 13 types of the dossier, with no secret type (EF-SEC-04)', () => {
    expect([...FIELD_TYPES].sort()).toEqual([...DOSSIER_TYPES].sort());
    expect(FIELD_TYPES).not.toContain('secret' as never);
  });

  it.each(FIELD_TYPES)('accepts a valid %s field', (type) => {
    expect(issuesOf(field(type, VALID[type]))).toEqual([]);
  });

  it('accepts the optional attributes: unique, default, validators and ui', () => {
    const document = field('date', {
      unique: true,
      default: '2026-10-02',
      validators: [
        { kind: 'expression', expr: 'value >= today()', message: "L'échéance doit être future" },
      ],
      ui: { component: 'input.date@1', placeholder: 'jj/mm/aaaa', help: 'Date limite', order: 3 },
    });
    expect(issuesOf(document)).toEqual([]);
  });

  it('accepts the example of dossier 6.3', () => {
    const example = {
      id: newId<'field'>(),
      key: 'dueDate',
      label: 'Échéance',
      type: 'date',
      required: true,
      classification: 'interne',
      validators: [
        { kind: 'expression', expr: 'value >= today()', message: "L'échéance doit être future" },
      ],
    };
    expect(issuesOf(example)).toEqual([]);
  });
});

describe('field type selection', () => {
  it('refuses a secret type or any unknown type, at the field itself', () => {
    for (const type of ['secret', 'password', 'String', '']) {
      expect(issuesOf(field(type))).toEqual(['discriminator /']);
    }
  });

  it('refuses a field without type or with a type that is not a string', () => {
    expect(issuesOf(without(field('date'), 'type'))).toEqual(['discriminator /']);
    expect(issuesOf(field('date', { type: 12 }))).toEqual(['discriminator /']);
  });

  it('refuses a field that is not an object', () => {
    expect(issuesOf('date')).toEqual(['type /']);
    expect(issuesOf(null)).toEqual(['type /']);
  });
});

describe('common attributes', () => {
  it('point at the offending property', () => {
    expect(issuesOf(field('date', { key: 'Due-Date' }))).toEqual(['pattern /key']);
    expect(issuesOf(field('date', { id: 'due-date' }))).toEqual(['pattern /id']);
    expect(issuesOf(field('date', { label: '' }))).toEqual(['minLength /label']);
    expect(issuesOf(field('date', { required: 'yes' }))).toEqual(['type /required']);
    expect(issuesOf(field('date', { unique: 1 }))).toEqual(['type /unique']);
  });

  it('refuse a classification outside public, interne and sensible', () => {
    expect(issuesOf(field('date', { classification: 'secret' }))).toEqual(['enum /classification']);
  });

  it('require id, key, label, required and classification', () => {
    for (const name of ['id', 'key', 'label', 'required', 'classification']) {
      expect(issuesOf(without(field('date'), name))).toEqual([`required /${name}`]);
    }
  });

  it('refuse any other property, such as a password (EF-SEC-04)', () => {
    expect(issuesOf(field('string', { password: 'hunter2' }))).toEqual([
      'additionalProperties /password',
    ]);
    expect(issuesOf(field('string', { secret: true }))).toEqual(['additionalProperties /secret']);
  });

  it('refuse a validator of an unknown kind or without message', () => {
    expect(
      issuesOf(field('date', { validators: [{ kind: 'regex', expr: 'x', message: 'm' }] })),
    ).toContain('const /validators/0/kind');
    expect(issuesOf(field('date', { validators: [{ kind: 'expression', expr: 'x' }] }))).toEqual([
      'required /validators/0/message',
    ]);
  });

  it('refuse an invalid ui block', () => {
    expect(issuesOf(field('date', { ui: { component: 'Input' } }))).toEqual([
      'pattern /ui/component',
    ]);
    expect(issuesOf(field('date', { ui: { color: 'red' } }))).toEqual([
      'additionalProperties /ui/color',
    ]);
  });
});

describe('type-specific options', () => {
  it('decimal requires precision and scale (decision D-07)', () => {
    expect(issuesOf(field('decimal'))).toEqual(['required /options']);
    expect(issuesOf(field('decimal', { options: { scale: 2 } }))).toEqual([
      'required /options/precision',
    ]);
    expect(issuesOf(field('decimal', { options: { precision: 10 } }))).toEqual([
      'required /options/scale',
    ]);
    expect(issuesOf(field('decimal', { options: { precision: 0, scale: 2 } }))).toEqual([
      'minimum /options/precision',
    ]);
    expect(issuesOf(field('decimal', { options: { precision: 10, scale: 39 } }))).toEqual([
      'maximum /options/scale',
    ]);
    expect(issuesOf(field('decimal', { options: { precision: 10, scale: 2.5 } }))).toEqual([
      'type /options/scale',
    ]);
  });

  it('choice and multiChoice need a source: a dictionary or a non-empty list', () => {
    expect(issuesOf(field('choice'))).toEqual(['required /options']);
    expect(issuesOf(field('choice', { options: {} }))).toEqual(['required /options/source']);
    expect(
      issuesOf(field('choice', { options: { source: { kind: 'list', values: [] } } })),
    ).toEqual(['minItems /options/source/values']);
    expect(issuesOf(field('choice', { options: { source: { kind: 'dictionary' } } }))).toEqual([
      'required /options/source/entity',
    ]);
    expect(issuesOf(field('choice', { options: { source: { kind: 'sql' } } }))).toEqual([
      'discriminator /options/source',
    ]);
    expect(
      issuesOf(
        field('multiChoice', { options: { source: { kind: 'list', values: [{ value: 'a' }] } } }),
      ),
    ).toEqual(['required /options/source/values/0/label']);
  });

  it('reference needs the id of its target entity, never a label', () => {
    expect(issuesOf(field('reference'))).toEqual(['required /options']);
    expect(issuesOf(field('reference', { options: { target: 'customer' } }))).toEqual([
      'pattern /options/target',
    ]);
  });

  it('string, text and integer bound their options', () => {
    expect(issuesOf(field('string', { options: { maxLength: 0 } }))).toEqual([
      'minimum /options/maxLength',
    ]);
    expect(issuesOf(field('string', { options: { maxLength: 256 } }))).toEqual([
      'maximum /options/maxLength',
    ]);
    expect(issuesOf(field('text', { options: { maxLength: 10_001 } }))).toEqual([
      'maximum /options/maxLength',
    ]);
    expect(issuesOf(field('integer', { options: { min: 1.5 } }))).toEqual(['type /options/min']);
  });

  it('file and image bound the size to the package limit and need a non-empty accept list', () => {
    for (const type of ['file', 'image']) {
      expect(issuesOf(field(type, { options: { maxSizeBytes: 104_857_601 } }))).toEqual([
        'maximum /options/maxSizeBytes',
      ]);
      expect(issuesOf(field(type, { options: { accept: [] } }))).toEqual([
        'minItems /options/accept',
      ]);
    }
  });

  it('types that take no options refuse them', () => {
    for (const type of ['date', 'datetime']) {
      expect(issuesOf(field(type, { options: {} }))).toEqual(['additionalProperties /options']);
    }
  });

  it('refuse an option that belongs to another type', () => {
    expect(issuesOf(field('string', { options: { precision: 10 } }))).toEqual([
      'additionalProperties /options/precision',
    ]);
  });
});

describe('error reporting', () => {
  it('reports every problem of a field at once', () => {
    const found = issuesOf(
      field('decimal', { key: 'Bad-Key', label: '', options: { precision: 10 }, password: 'x' }),
    );
    expect(found.sort()).toEqual(
      [
        'pattern /key',
        'minLength /label',
        'required /options/scale',
        'additionalProperties /password',
      ].sort(),
    );
  });
});
