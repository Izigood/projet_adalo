import { Type } from '@sinclair/typebox';
import { Ajv } from 'ajv';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forbiddenConstructs,
  generateValidators,
  validatorName,
  writeValidators,
} from './generate-validators.js';
import type { SchemaRegistry } from './generate-validators.js';

type Validator = ((data: unknown) => boolean) & {
  errors?: { instancePath: string; keyword: string; params: Record<string, unknown> }[] | null;
};

const label = Type.String({ minLength: 1, maxLength: 20 });
const common = { id: Type.String(), label };
const toy: SchemaRegistry = {
  Entity: Type.Object(
    {
      fields: Type.Array(
        Type.Unsafe({
          type: 'object',
          oneOf: [
            Type.Object(
              { ...common, type: Type.Literal('string') },
              { additionalProperties: false },
            ),
            Type.Object(
              {
                ...common,
                type: Type.Literal('decimal'),
                options: Type.Object(
                  { precision: Type.Integer(), scale: Type.Integer() },
                  { additionalProperties: false },
                ),
              },
              { additionalProperties: false },
            ),
          ],
          discriminator: { propertyName: 'type' },
        }),
        { minItems: 1 },
      ),
    },
    { additionalProperties: false },
  ),
};

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** Writes the generated module to a temp folder and imports it like an application would. */
async function load(schemas: SchemaRegistry): Promise<Record<string, Validator>> {
  const directory = mkdtempSync(join(tmpdir(), 'acs-validators-'));
  directories.push(directory);
  writeValidators(directory, schemas);
  return (await import(
    /* @vite-ignore */ pathToFileURL(join(directory, 'validators.js')).href
  )) as Record<string, Validator>;
}

/** Runs `work` while the Function constructor throws, as under a CSP without unsafe-eval. */
function withoutDynamicCode<T>(work: () => T): T {
  const original = globalThis.Function;
  globalThis.Function = function blocked() {
    throw new EvalError('dynamic code evaluation is blocked');
  } as unknown as FunctionConstructor;
  try {
    return work();
  } finally {
    globalThis.Function = original;
  }
}

const valid = {
  fields: [
    { id: 'a', label: 'Name', type: 'string' },
    { id: 'b', label: 'Amount', type: 'decimal', options: { precision: 10, scale: 2 } },
  ],
};

describe('generated validators are standalone', () => {
  it('contain none of the constructs that would make them depend on something at run time', () => {
    expect(forbiddenConstructs(generateValidators(toy).js)).toEqual([]);
  });

  it('forbiddenConstructs names each construct it finds (negative control of the check itself)', () => {
    const cases: [string, string][] = [
      ['const x = require("ajv/dist/runtime/equal");', 'a require() call'],
      ['import equal from "ajv/dist/runtime/equal";', 'an import statement'],
      ['"use strict";import{equal}from"x";', 'an import statement'],
      ['const a = 1;\nimport * as ns from "x";', 'an import statement'],
      ['import "side-effect";', 'an import statement'],
      ['const m = await import("x");', 'a dynamic import()'],
      ['export * from "x";', 'a re-export from another module'],
      ['export { a, b } from "x";', 'a re-export from another module'],
      ['const f = new Function("return 1");', 'new Function'],
      ['const f = Function("return 1");', 'a call to Function()'],
      ['eval("1")', 'eval'],
    ];
    for (const [code, expected] of cases) {
      expect(forbiddenConstructs(code), code).toContain(expected);
    }
  });

  it('forbiddenConstructs leaves ordinary generated code alone', () => {
    const clean = [
      'export const validateX = validate10;',
      'const schema = {"description":"how to import a package","type":"object"};',
      'data.reimport = 1; const important = 2; obj.Function = 3; x.eval = 4;',
      'if (data.Function === undefined) {}',
      'export const a = 1; export { b };',
    ];
    for (const code of clean) expect(forbiddenConstructs(code), code).toEqual([]);
  });

  it('validate while dynamic code evaluation is blocked', async () => {
    const validators = await load(toy);
    const validateEntity = validators[validatorName('Entity')] as Validator;
    expect(withoutDynamicCode(() => validateEntity(valid))).toBe(true);
    expect(withoutDynamicCode(() => validateEntity({ fields: [] }))).toBe(false);
  });

  it('negative control: an Ajv compiled at run time does fail without dynamic code', () => {
    const runtime = new Ajv({ discriminator: true, strict: true, logger: false });
    expect(() => withoutDynamicCode(() => runtime.compile(toy['Entity'] as object))).toThrow(
      /blocked/,
    );
  });

  it('refuses output that would need a run-time helper (uniqueItems requires "equal")', () => {
    const needsHelper: SchemaRegistry = {
      Tags: Type.Array(Type.Object({ a: Type.String() }), { uniqueItems: true }),
    };
    expect(() => generateValidators(needsHelper)).toThrow(/not self-contained/);
  });

  it('does not depend on Ajv: the generated file mentions no package', () => {
    const directory = mkdtempSync(join(tmpdir(), 'acs-validators-'));
    directories.push(directory);
    writeValidators(directory, toy);
    expect(readFileSync(join(directory, 'validators.js'), 'utf8')).not.toMatch(/ajv\//);
  });
});

describe('generated validators report where the document is wrong', () => {
  it('points at the exact property for missing, unknown and badly tagged items', async () => {
    const validateEntity = (await load(toy))[validatorName('Entity')] as Validator;
    const broken = {
      fields: [
        valid.fields[0],
        { id: 'b', label: 'Amount', type: 'decimal', options: { precision: 10 } },
        { id: 'c', label: 'Odd', type: 'nope' },
        { id: 'd', label: 'Name', type: 'string', password: 'x' },
        { id: 'e', label: '', type: 'string' },
      ],
    };
    expect(validateEntity(broken)).toBe(false);
    const found = (validateEntity.errors ?? []).map((e) => `${e.keyword} ${e.instancePath}`);
    expect(found).toContain('required /fields/1/options');
    expect(found).toContain('discriminator /fields/2');
    expect(found).toContain('additionalProperties /fields/3');
    expect(found).toContain('minLength /fields/4/label');
  });

  it('reports every error, not only the first', async () => {
    const validateEntity = (await load(toy))[validatorName('Entity')] as Validator;
    validateEntity({ fields: [{ id: 1, label: 2, type: 'string' }] });
    expect((validateEntity.errors ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('generated declarations', () => {
  it('declare one validator per schema', () => {
    const { dts } = generateValidators({ ...toy, Other: Type.Object({}) });
    expect(dts).toContain('export const validateEntity: ValidatorFunction;');
    expect(dts).toContain('export const validateOther: ValidatorFunction;');
    expect(dts).toContain('export interface ValidationErrorLike');
  });
});

describe('strictness', () => {
  it('rejects an unknown schema keyword instead of ignoring it', () => {
    const typo: SchemaRegistry = { Bad: Type.Unsafe({ type: 'object', requiredd: ['a'] }) };
    expect(() => generateValidators(typo)).toThrow(/requiredd/);
  });
});
