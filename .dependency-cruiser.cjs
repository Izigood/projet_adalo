/**
 * Allowed dependencies between workspace modules: translation of dossier table 9.2.
 * Each module may import ONLY the modules listed here (allow-list), which covers both columns of
 * the table ("peut dépendre de" and "ne doit jamais dépendre de").
 * Do not edit to make an import pass: change the table through an ADR first (CLAUDE.md).
 */

const RUNTIME_PACKAGES = [
  'domain',
  'project-schema',
  'expression',
  'data-repository',
  'component-sdk',
  'components',
  'design-system',
  'workflow-engine',
  'policy',
];

const ALL_PACKAGES = [...RUNTIME_PACKAGES, 'validator', 'publisher', 'testing'];

const pkg = (names) => names.map((name) => `packages/${name}`);

/** module directory -> workspace modules it may import (its own directory is always allowed). */
const ALLOWED = {
  'packages/domain': [],
  'packages/project-schema': pkg(['domain']),
  'packages/expression': pkg(['domain']),
  'packages/data-repository': pkg(['domain', 'project-schema', 'expression']),
  'packages/component-sdk': pkg(['domain', 'project-schema']),
  'packages/components': pkg(['component-sdk', 'design-system']),
  'packages/design-system': [],
  'packages/workflow-engine': pkg(['domain', 'expression']),
  'packages/policy': pkg(['domain', 'expression']),
  'packages/validator': pkg(['project-schema', 'expression', 'component-sdk', 'policy']),
  'packages/publisher': pkg(['project-schema', 'validator']),
  'packages/testing': pkg(['domain', 'project-schema']),
  'apps/runtime': pkg(RUNTIME_PACKAGES),
  'apps/studio': pkg(ALL_PACKAGES),
  'tools/acs-cli': pkg(['domain', 'project-schema', 'validator', 'publisher']),
  'tools/gate-tests': [],
};

const TEST_FILE = '\\.test\\.[cm]?[jt]sx?$';
const escape = (path) => path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const alternatives = (paths) => paths.map(escape).join('|');

/** Tests may additionally use the shared fixtures of packages/testing. */
const moduleRules = Object.entries(ALLOWED).flatMap(([dir, allowed]) => {
  const rule = (suffix, extra, from) => ({
    name: `${dir.replace('/', '-')}-allowed-deps${suffix}`,
    severity: 'error',
    comment: `${dir} may only depend on: ${[...allowed, ...extra].join(', ') || 'nothing'} (dossier 9.2).`,
    from,
    to: {
      path: '^(packages|apps|tools)/',
      pathNot: `^(${alternatives([dir, ...allowed, ...extra])})/`,
    },
  });
  return [
    rule('', [], { path: `^${escape(dir)}/`, pathNot: TEST_FILE }),
    rule('-tests', ['packages/testing'], { path: `^${escape(dir)}/.*${TEST_FILE}` }),
  ];
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...moduleRules,
    {
      name: 'dexie-only-in-data-repository',
      severity: 'error',
      comment: 'Data access goes through the Repository port; Dexie stays inside data-repository.',
      from: { pathNot: '^packages/data-repository/' },
      to: { path: 'node_modules/dexie/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve (a package imported without being exported is a bug).',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(^|/)(dist|coverage|playwright-report|test-results|\\.tmp)(/|$)',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
