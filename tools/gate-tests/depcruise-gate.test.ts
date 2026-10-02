import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_DEPCRUISE_CONFIG, runDepcruise, withScratchProject } from './run-gate.js';
import type { Fixture } from './run-gate.js';

/**
 * REC-10: negative controls of the dependency-cruiser gate (dossier table 9.2). Fixtures reproduce
 * the monorepo layout; the repo configuration decides whether the import is accepted.
 */
const entry = (name: string, imports = ''): Fixture => ({
  [`packages/${name}/package.json`]: JSON.stringify({
    name: `@acs/${name}`,
    type: 'module',
    exports: { '.': './src/index.ts' },
  }),
  [`packages/${name}/src/index.ts`]: `${imports}export const name = '${name}';\n`,
});

const rulesOf = (files: Fixture, linkPackages: readonly string[] = []) =>
  withScratchProject(files, (dir) => {
    for (const name of linkPackages) {
      const link = join(dir, 'node_modules', '@acs', name);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(join(dir, 'packages', name), link, 'junction');
    }
    return runDepcruise(dir);
  });

describe('dependency gate (REC-10)', () => {
  it('refuses components -> data-repository (relative import)', () => {
    const run = rulesOf({
      ...entry('data-repository'),
      ...entry(
        'components',
        "import { name } from '../../data-repository/src/index.js';\nvoid name;\n",
      ),
    });
    expect(run.status).not.toBe(0);
    expect(run.violations).toEqual([
      {
        rule: 'packages-components-allowed-deps',
        from: 'packages/components/src/index.ts',
        to: 'packages/data-repository/src/index.ts',
      },
    ]);
  });

  it('refuses the same import written with the workspace package name', () => {
    const run = rulesOf(
      {
        ...entry('data-repository'),
        ...entry('components', "import { name } from '@acs/data-repository';\nvoid name;\n"),
      },
      ['data-repository'],
    );
    expect(run.status).not.toBe(0);
    expect(run.violations.map((v) => v.rule)).toEqual(['packages-components-allowed-deps']);
  });

  it('accepts components -> component-sdk', () => {
    const run = rulesOf({
      ...entry('component-sdk'),
      ...entry(
        'components',
        "import { name } from '../../component-sdk/src/index.js';\nvoid name;\n",
      ),
    });
    expect(run.violations).toEqual([]);
    expect(run.status).toBe(0);
  });

  it('refuses domain -> expression (domain depends on nothing)', () => {
    const run = rulesOf({
      ...entry('expression'),
      ...entry('domain', "import { name } from '../../expression/src/index.js';\nvoid name;\n"),
    });
    expect(run.violations.map((v) => v.rule)).toEqual(['packages-domain-allowed-deps']);
  });

  it('refuses studio -> runtime internals and runtime -> studio', () => {
    const app = (name: string, imports = ''): Fixture => ({
      [`apps/${name}/src/main.ts`]: `${imports}export const app = '${name}';\n`,
    });
    const studioToRuntime = rulesOf({
      ...app('runtime'),
      ...app('studio', "import { app } from '../../runtime/src/main.js';\nvoid app;\n"),
    });
    const runtimeToStudio = rulesOf({
      ...app('studio'),
      ...app('runtime', "import { app } from '../../studio/src/main.js';\nvoid app;\n"),
    });
    expect(studioToRuntime.violations.map((v) => v.rule)).toEqual(['apps-studio-allowed-deps']);
    expect(runtimeToStudio.violations.map((v) => v.rule)).toEqual(['apps-runtime-allowed-deps']);
  });

  it('refuses Dexie outside data-repository and accepts it inside', () => {
    const dexie: Fixture = {
      'node_modules/dexie/package.json': JSON.stringify({ name: 'dexie', main: 'index.js' }),
      'node_modules/dexie/index.js': 'module.exports = {};\n',
    };
    const outside = rulesOf({
      ...dexie,
      ...entry('workflow-engine', "import 'dexie';\n"),
    });
    const inside = rulesOf({
      ...dexie,
      ...entry('data-repository', "import 'dexie';\n"),
    });
    expect(outside.violations.map((v) => v.rule)).toEqual(['dexie-only-in-data-repository']);
    expect(inside.violations).toEqual([]);
  });

  it('refuses shared test fixtures from production code but accepts them from tests', () => {
    const production = rulesOf({
      ...entry('testing'),
      ...entry('domain', "import { name } from '../../testing/src/index.js';\nvoid name;\n"),
    });
    const tests = rulesOf({
      ...entry('testing'),
      ...entry('domain'),
      'packages/domain/src/index.test.ts':
        "import { name } from '../../testing/src/index.js';\nvoid name;\n",
    });
    expect(production.violations.map((v) => v.rule)).toEqual(['packages-domain-allowed-deps']);
    expect(tests.violations).toEqual([]);
  });

  it('refuses circular dependencies and unresolvable imports', () => {
    const circular = rulesOf({
      ...entry('domain'),
      'packages/domain/src/a.ts': "import { b } from './b.js';\nexport const a = b;\n",
      'packages/domain/src/b.ts': "import { a } from './a.js';\nexport const b = a;\n",
    });
    const unresolvable = rulesOf({
      ...entry('domain', "import './missing.js';\n"),
    });
    expect(circular.violations.map((v) => v.rule)).toContain('no-circular');
    expect(unresolvable.violations.map((v) => v.rule)).toEqual(['not-to-unresolvable']);
  });

  it('lets a forbidden import through once its rule is removed', () => {
    const files: Fixture = {
      ...entry('data-repository'),
      ...entry(
        'components',
        "import { name } from '../../data-repository/src/index.js';\nvoid name;\n",
      ),
    };
    const run = withScratchProject(files, (dir) => {
      const relaxed = join(dir, 'relaxed.depcruise.cjs');
      writeFileSync(
        relaxed,
        `const config = require(${JSON.stringify(REPO_DEPCRUISE_CONFIG)});
config.forbidden = config.forbidden.filter((rule) => rule.name !== 'packages-components-allowed-deps');
module.exports = config;
`,
      );
      return runDepcruise(dir, relaxed);
    });
    expect(run.violations).toEqual([]);
    expect(run.status).toBe(0);
  });
});
