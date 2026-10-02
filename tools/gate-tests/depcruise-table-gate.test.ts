import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDepcruise, withScratchProject } from './run-gate.js';
import type { Fixture } from './run-gate.js';

/**
 * REC-10: every row of the dependency table (dossier 9.2, read as in ADR-0023) is exercised.
 * The expectations below are written out from the dossier and the ADR on purpose: they must not be
 * derived from .dependency-cruiser.cjs, or a wrong row there would be validated by itself.
 *
 * Per module, one fixture imports every allowed and every forbidden module; dependency-cruiser
 * must flag exactly the forbidden ones.
 */
const RUNTIME = [
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
const PACKAGES = [...RUNTIME, 'validator', 'publisher', 'testing'];
const ALL_MODULES = [...PACKAGES.map((name) => `packages/${name}`), 'apps/runtime', 'apps/studio'];

const pkg = (names: string[]) => names.map((name) => `packages/${name}`);

/** Modules each row may import. Everything else among ALL_MODULES is forbidden. */
const ALLOWED: Record<string, string[]> = {
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
  'apps/runtime': pkg(RUNTIME),
  'apps/studio': pkg(PACKAGES),
};

const entryOf = (module: string) =>
  module.startsWith('apps/') ? `${module}/src/main.ts` : `${module}/src/index.ts`;

function fixtureFor(source: string): Fixture {
  const importer = entryOf(source);
  const targets = ALL_MODULES.filter((module) => module !== source);
  const imports = targets
    .map((target, index) => {
      const specifier = posix
        .relative(posix.dirname(importer), entryOf(target))
        .replace(/\.ts$/, '.js');
      return `import { id as id${index} } from '${specifier}';\nvoid id${index};\n`;
    })
    .join('');
  return {
    [importer]: `${imports}export const id = '${source}';\n`,
    ...Object.fromEntries(
      targets.map((target) => [entryOf(target), `export const id = '${target}';\n`]),
    ),
  };
}

describe('dependency table 9.2, row by row (REC-10)', () => {
  it.each(Object.entries(ALLOWED))('%s may import only its allowed modules', (source, allowed) => {
    const run = withScratchProject(fixtureFor(source), (dir) => runDepcruise(dir));
    const forbidden = ALL_MODULES.filter(
      (module) => module !== source && !allowed.includes(module),
    );

    const flagged = run.violations
      .filter((violation) => violation.from === entryOf(source))
      .map((violation) => violation.to)
      .sort();

    expect(flagged).toEqual(forbidden.map(entryOf).sort());
    expect(run.violations.every((violation) => violation.rule !== 'no-circular')).toBe(true);
    expect(run.status).not.toBe(0);
  });
});
