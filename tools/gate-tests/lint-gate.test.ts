import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * REC-10: negative controls of the ESLint gate. For every forbidden pattern of CLAUDE.md we check
 * three behaviours: compliant code passes, forbidden code is refused by the expected rule, and
 * the same forbidden code passes once that rule is switched off (the rule is what blocks it).
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LIB_FILE = 'packages/domain/src/fixture.ts';

type Case = {
  readonly name: string;
  readonly rule: string;
  readonly bad: string;
  readonly good: string;
  readonly file?: string;
};

const cases: readonly Case[] = [
  {
    name: 'eval',
    rule: 'no-eval',
    bad: "eval('1 + 1');\n",
    good: 'export const value = 1 + 1;\n',
  },
  {
    name: 'indirect eval through window',
    rule: 'no-eval',
    bad: "window.eval('1 + 1');\n",
    good: 'export const value = 1 + 1;\n',
  },
  {
    name: 'new Function',
    rule: 'no-new-func',
    bad: "export const run = new Function('return 1');\n",
    good: 'export const run = () => 1;\n',
  },
  {
    name: 'setTimeout with a string',
    rule: 'no-implied-eval',
    bad: "setTimeout('doWork()', 10);\n",
    good: 'setTimeout(() => undefined, 10);\n',
  },
  {
    name: 'explicit any',
    rule: '@typescript-eslint/no-explicit-any',
    bad: 'export const value: any = 1;\n',
    good: 'export const value: unknown = 1;\n',
  },
  {
    name: 'innerHTML with dynamic data',
    rule: 'no-restricted-syntax',
    bad: 'export const render = (el: HTMLElement, html: string) => {\n  el.innerHTML = html;\n};\n',
    good: "export const clear = (el: HTMLElement) => {\n  el.innerHTML = '';\n};\n",
  },
  {
    name: 'outerHTML with dynamic data (bracket access)',
    rule: 'no-restricted-syntax',
    bad: "export const render = (el: HTMLElement, html: string) => {\n  el['outerHTML'] = html;\n};\n",
    good: 'export const read = (el: HTMLElement) => el.outerHTML;\n',
  },
  {
    name: 'export default',
    rule: 'no-restricted-syntax',
    bad: 'export default 1;\n',
    good: 'export const value = 1;\n',
  },
  {
    name: 'export default stays allowed in tool configuration files',
    rule: 'no-restricted-syntax',
    bad: 'export default 1;\n',
    good: 'export default 1;\n',
    file: 'vite.config.ts',
  },
  {
    name: 'localStorage global',
    rule: 'no-restricted-globals',
    bad: "localStorage.setItem('draft', '{}');\n",
    good: 'export const value = 1;\n',
  },
  {
    name: 'localStorage through window',
    rule: 'no-restricted-properties',
    bad: "window.localStorage.setItem('draft', '{}');\n",
    good: 'export const value = 1;\n',
  },
  {
    name: 'localStorage in the interface preferences module',
    rule: 'no-restricted-globals',
    bad: "localStorage.setItem('theme', 'dark');\n",
    good: "localStorage.setItem('theme', 'dark');\n",
    file: 'apps/studio/src/preferences/theme.ts',
  },
  {
    name: 'Ajv runtime compilation',
    rule: 'no-restricted-imports',
    bad: "import { Ajv } from 'ajv';\nexport const ajv = new Ajv();\n",
    good: 'export const value = 1;\n',
  },
  {
    name: 'Lit unsafeHTML',
    rule: 'no-restricted-imports',
    bad: "import { unsafeHTML } from 'lit/directives/unsafe-html.js';\nexport const directive = unsafeHTML;\n",
    good: "import { html } from 'lit';\nexport const template = html;\n",
  },
  {
    name: 'Lit unsafeSVG',
    rule: 'no-restricted-imports',
    bad: "import { unsafeSVG } from 'lit/directives/unsafe-svg.js';\nexport const directive = unsafeSVG;\n",
    good: "import { svg } from 'lit';\nexport const template = svg;\n",
  },
  {
    name: 'lit-html unsafeHTML',
    rule: 'no-restricted-imports',
    bad: "import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';\nexport const directive = unsafeHTML;\n",
    good: "import { html } from 'lit-html';\nexport const template = html;\n",
  },
  {
    name: 'setInterval with a string',
    rule: 'no-implied-eval',
    bad: "setInterval('poll()', 1000);\n",
    good: 'setInterval(() => undefined, 1000);\n',
  },
  {
    name: 'localStorage through globalThis',
    rule: 'no-restricted-properties',
    bad: "globalThis.localStorage.setItem('draft', '{}');\n",
    good: 'export const value = 1;\n',
  },
  {
    name: 'localStorage through self',
    rule: 'no-restricted-properties',
    bad: "self.localStorage.setItem('draft', '{}');\n",
    good: 'export const value = 1;\n',
  },
  {
    name: 'localStorage in a TSX file outside the preferences module',
    rule: 'no-restricted-globals',
    bad: "localStorage.setItem('draft', '{}');\n",
    good: 'export const value = 1;\n',
    file: 'apps/studio/src/app.tsx',
  },
  {
    name: 'localStorage in a TSX file of the preferences module',
    rule: 'no-restricted-globals',
    bad: "localStorage.setItem('theme', 'dark');\n",
    good: "localStorage.setItem('theme', 'dark');\n",
    file: 'apps/studio/src/preferences/theme.tsx',
  },
  {
    name: 'export default in a *.config.ts file hidden inside src',
    rule: 'no-restricted-syntax',
    bad: 'export default 1;\n',
    good: 'export const value = 1;\n',
    file: 'packages/domain/src/theme.config.ts',
  },
  {
    name: 'Ajv compiling entry point (ajv/dist/2020)',
    rule: 'no-restricted-imports',
    bad: "import Ajv2020 from 'ajv/dist/2020';\nexport const ajv = new Ajv2020();\n",
    good: 'export const value = 1;\n',
  },
  {
    name: 'Ajv import in the project-schema build scripts stays allowed (ADR-0027)',
    rule: 'no-restricted-imports',
    bad: "import { Ajv } from 'ajv';\nexport const ajv = new Ajv();\n",
    good: "import { Ajv } from 'ajv';\nexport const ajv = new Ajv();\n",
    file: 'packages/project-schema/scripts/generate-validators.ts',
  },
  {
    name: 'Ajv import under project-schema src',
    rule: 'no-restricted-imports',
    bad: "import { Ajv } from 'ajv';\nexport const ajv = new Ajv();\n",
    good: 'export const value = 1;\n',
    file: 'packages/project-schema/src/validate.ts',
  },
  {
    name: 'Ajv import in the scripts folder of another package',
    rule: 'no-restricted-imports',
    bad: "import { Ajv } from 'ajv';\nexport const ajv = new Ajv();\n",
    good: 'export const value = 1;\n',
    file: 'packages/domain/scripts/generate.ts',
  },
  {
    name: 'Lit unsafeHTML in the project-schema build scripts',
    rule: 'no-restricted-imports',
    bad: "import { unsafeHTML } from 'lit/directives/unsafe-html.js';\nexport const directive = unsafeHTML;\n",
    good: 'export const value = 1;\n',
    file: 'packages/project-schema/scripts/generate-validators.ts',
  },
  {
    name: 'Ajv runtime helpers imported by generated standalone validators stay allowed',
    rule: 'no-restricted-imports',
    bad: "import equal from 'ajv/dist/runtime/equal';\nexport const same = equal;\n",
    good: "import equal from 'ajv/dist/runtime/equal';\nexport const same = equal;\n",
  },
];

// Cases whose "bad" code is deliberately accepted (allow-lists): the rule must stay silent.
const ALLOWED = new Set([
  'export default stays allowed in tool configuration files',
  'localStorage in the interface preferences module',
  'localStorage in a TSX file of the preferences module',
  'Ajv import in the project-schema build scripts stays allowed (ADR-0027)',
  'Ajv runtime helpers imported by generated standalone validators stay allowed',
]);

async function violations(code: string, file: string, switchedOff?: string) {
  const eslint = new ESLint({
    cwd: repoRoot,
    ...(switchedOff === undefined
      ? {}
      : { overrideConfig: { rules: { [switchedOff]: 'off' as const } } }),
  });
  const [result] = await eslint.lintText(code, { filePath: resolve(repoRoot, file) });
  return (result?.messages ?? []).filter((m) => m.severity === 2);
}

describe('lint gate (REC-10)', () => {
  for (const c of cases) {
    const file = c.file ?? LIB_FILE;

    it(`${c.name}: compliant code passes`, async () => {
      expect(await violations(c.good, file)).toEqual([]);
    });

    if (ALLOWED.has(c.name)) continue;

    it(`${c.name}: forbidden code is refused by ${c.rule}`, async () => {
      const found = await violations(c.bad, file);
      expect(found.map((m) => m.ruleId)).toContain(c.rule);
    });

    it(`${c.name}: switching ${c.rule} off lets it through`, async () => {
      const found = await violations(c.bad, file, c.rule);
      expect(found.map((m) => m.ruleId)).not.toContain(c.rule);
    });
  }

  it('the eslint CLI exits non-zero on forbidden code and zero on clean code', () => {
    const require = createRequire(import.meta.url);
    const bin = resolve(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
    const lint = (code: string) =>
      spawnSync(process.execPath, [bin, '--stdin', '--stdin-filename', LIB_FILE], {
        cwd: repoRoot,
        input: code,
        encoding: 'utf8',
      });

    const dirty = lint("eval('1 + 1');\n");
    expect(dirty.status).toBe(1);
    expect(dirty.stdout).toContain('no-eval');
    expect(lint('export const value = 1;\n').status).toBe(0);
  });
});
