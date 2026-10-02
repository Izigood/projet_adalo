import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Forbidden patterns of CLAUDE.md / dossier 9.3, enforced as blocking errors. */

const DYNAMIC_HTML_SINKS = [
  {
    selector:
      "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(innerHTML|outerHTML)$/]:not([right.type='Literal'])",
    message: 'innerHTML/outerHTML with dynamic data is forbidden (XSS). Render with Lit templates.',
  },
  {
    selector:
      "AssignmentExpression[left.type='MemberExpression'][left.property.value=/^(innerHTML|outerHTML)$/]:not([right.type='Literal'])",
    message: 'innerHTML/outerHTML with dynamic data is forbidden (XSS). Render with Lit templates.',
  },
];

const NO_EXPORT_DEFAULT = {
  selector: 'ExportDefaultDeclaration',
  message: 'export default is forbidden: use named exports.',
};

const LOCAL_STORAGE_MESSAGE =
  'localStorage is reserved for interface preferences (apps/*/src/preferences). Use the Repository port for data.';

// Every Ajv entry point that compiles schemas with new Function. `ajv/dist/runtime/*` and
// `ajv/dist/standalone` stay allowed: generated standalone validators import the former, and the
// build-time generator is the latter.
const AJV_COMPILING_ENTRIES = [
  'ajv',
  'ajv/dist/ajv',
  'ajv/dist/2019',
  'ajv/dist/2020',
  'ajv/dist/jtd',
];

const UNSAFE_LIT_PATTERNS = [
  'lit/directives/unsafe-html*',
  'lit/directives/unsafe-svg*',
  'lit-html/directives/unsafe-html*',
  'lit-html/directives/unsafe-svg*',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'tools/gate-tests/.tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    // Declared globals are required: no-eval and no-implied-eval only recognise window/setTimeout
    // when they resolve to a known global.
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-eval': ['error', { allowIndirect: false }],
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', ...DYNAMIC_HTML_SINKS, NO_EXPORT_DEFAULT],
      'no-restricted-globals': ['error', { name: 'localStorage', message: LOCAL_STORAGE_MESSAGE }],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: 'localStorage',
          message: LOCAL_STORAGE_MESSAGE,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: AJV_COMPILING_ENTRIES.map((name) => ({
            name,
            message:
              'Ajv runtime compilation is forbidden (CSP, no new Function). Use generated standalone validators.',
          })),
          patterns: UNSAFE_LIT_PATTERNS.map((group) => ({
            group: [group],
            message: 'Lit unsafeHTML/unsafeSVG directives are forbidden.',
          })),
        },
      ],
    },
  },
  {
    // Tool configuration files require a default export; every other forbidden pattern still applies.
    // Only at the repository root or directly inside a workspace directory, never in `src`.
    files: [
      '*.config.{js,ts,mjs,cjs}',
      'apps/*/*.config.{js,ts,mjs,cjs}',
      'packages/*/*.config.{js,ts,mjs,cjs}',
      'tools/*/*.config.{js,ts,mjs,cjs}',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...DYNAMIC_HTML_SINKS],
    },
  },
  {
    // The only place allowed to use localStorage: interface preferences.
    files: ['apps/*/src/preferences/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
);
