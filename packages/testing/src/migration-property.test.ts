import { migratePackage, openPackage } from '@acs/project-schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { consistencyProblems, stableId } from './index.js';

/**
 * Property: for any well-formed v0 document, migrating gives a valid and consistent v1 package,
 * leaves its input untouched, and is deterministic for a given identifier source (dossier 9.4).
 */
const word = fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,10}$/);
const FIELD_TYPES = ['string', 'longtext', 'number', 'bool', 'date', 'link'] as const;
const KINDS = ['one-to-one', 'one-to-many', 'many-to-many'] as const;
const COLOR = fc.constantFrom(
  '#fff',
  '#000000',
  'rgb(0 0 0 / 0.5)',
  '0.5rem',
  'system-ui, sans-serif',
);

type V0Node = { component: string; props: Record<string, unknown>; children: V0Node[] };

const node = (depth: number): fc.Arbitrary<V0Node> =>
  fc.record({
    component: fc.constantFrom('page', 'title', 'list'),
    props: fc.dictionary(word, fc.oneof(fc.string({ maxLength: 10 }), fc.integer(), fc.boolean())),
    children: depth === 0 ? fc.constant([]) : fc.array(node(depth - 1), { maxLength: 2 }),
  });

const fieldsOf = (entityCount: number) =>
  fc
    .uniqueArray(
      fc.record({
        name: word,
        type: fc.constantFrom(...FIELD_TYPES),
        required: fc.boolean(),
        decimals: fc.option(fc.nat(8), { nil: undefined }),
        target: fc.nat(entityCount - 1),
      }),
      { selector: (field) => field.name, minLength: 1, maxLength: 5 },
    )
    .map((fields) =>
      fields.map((field, index) => ({
        id: `f${index}`,
        name: field.name,
        title: field.name,
        type: field.type,
        required: field.required,
        ...(field.type === 'number' && field.decimals !== undefined
          ? { decimals: field.decimals }
          : {}),
        ...(field.type === 'link' ? { to: `e${field.target}` } : {}),
      })),
    );

const v0Document = fc.integer({ min: 1, max: 4 }).chain((count) =>
  fc.record({
    project: fc.record({
      code: fc.stringMatching(/^[A-Z][A-Z0-9]{1,15}$/),
      title: fc.string({ minLength: 1, maxLength: 40 }),
      lang: fc.constantFrom('fr', 'fr-FR', 'en-GB'),
      version: fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)).map((parts) => parts.join('.')),
    }),
    entities: fc
      .tuple(
        fc.uniqueArray(word, { minLength: count, maxLength: count }),
        fc.array(fieldsOf(count), { minLength: count, maxLength: count }),
      )
      .map(([names, fields]) =>
        names.map((name, index) => ({ id: `e${index}`, name, title: name, fields: fields[index] })),
      ),
    relations: fc
      .array(
        fc.record({
          from: fc.nat(count - 1),
          to: fc.nat(count - 1),
          kind: fc.constantFrom(...KINDS),
        }),
        { maxLength: 4 },
      )
      .map((relations) =>
        relations.map((r, index) => ({
          id: `r${index}`,
          from: `e${r.from}`,
          to: `e${r.to}`,
          kind: r.kind,
        })),
      ),
    screens: fc
      .array(
        fc.record({ name: word, path: fc.stringMatching(/^\/[a-z0-9-]{0,8}$/), tree: node(3) }),
        {
          minLength: 1,
          maxLength: 3,
        },
      )
      .map((screens) => screens.map((screen, index) => ({ id: `s${index}`, ...screen }))),
    theme: fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      colors: fc.dictionary(fc.stringMatching(/^[a-z]{1,6}\.[a-z0-9]{1,6}$/), COLOR),
      dark: fc.dictionary(fc.stringMatching(/^[a-z]{1,6}\.[a-z0-9]{1,6}$/), COLOR),
    }),
  }),
);

const freeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/** 1 000 generated documents take a few seconds: more than Vitest's default 5 s. */
const PROPERTY_TIMEOUT = 60_000;

describe('migration v0 to v1, for any well-formed v0 document', () => {
  it(
    'always yields a valid, consistent v1 package (1 000 documents)',
    () => {
      fc.assert(
        fc.property(v0Document, (doc) => {
          const result = openPackage({ 'project.json': doc });
          if (!result.ok) return false;
          return consistencyProblems(result.value).length === 0;
        }),
        { numRuns: 1000 },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it(
    'never modifies its input',
    () => {
      fc.assert(
        fc.property(v0Document, (doc) => {
          const files = freeze({ 'project.json': structuredClone(doc) });
          return migratePackage(files).ok;
        }),
        { numRuns: 300 },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it(
    'is deterministic for a given identifier source, and keeps one entity per v0 entity',
    () => {
      const context = { newId: (hint: string) => stableId(hint) as string };
      fc.assert(
        fc.property(v0Document, (doc) => {
          const first = migratePackage({ 'project.json': doc }, { context });
          const second = migratePackage({ 'project.json': doc }, { context });
          expect(first).toEqual(second);
          if (!first.ok) return false;
          const entities = (first.value['schema/entities.json'] as { entities: unknown[] })
            .entities;
          return entities.length === doc.entities.length;
        }),
        { numRuns: 300 },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it('property check has teeth: a v0 document with a dangling link is not accepted', () => {
    const doc = {
      project: { code: 'AB', title: 'T', lang: 'fr', version: '1.0.0' },
      entities: [
        {
          id: 'e0',
          name: 'a',
          title: 'A',
          fields: [{ id: 'f0', name: 'l', title: 'L', type: 'link', to: 'e9' }],
        },
      ],
      relations: [],
      screens: [
        { id: 's0', name: 'home', path: '/', tree: { component: 'page', props: {}, children: [] } },
      ],
      theme: { name: 'T', colors: {}, dark: {} },
    };
    expect(openPackage({ 'project.json': doc }).ok).toBe(false);
  });
});
