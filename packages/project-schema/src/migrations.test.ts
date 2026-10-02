import { domainError, err, isUuidV7, ok } from '@acs/domain';
import type { Result } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, detectManifestVersion, migratePackage, openPackage } from './index.js';
import type { MigrationContext, MigrationStep, PackageFiles } from './index.js';

/** A package of the given format version; version 0 is the one that has no manifestVersion. */
const at = (version: number | undefined, extra: Record<string, unknown> = {}): PackageFiles => ({
  'project.json':
    version === undefined || version === 0 ? { ...extra } : { manifestVersion: version, ...extra },
});

const trailOf = (files: PackageFiles): string[] =>
  ((files['project.json'] as { trail?: string[] }).trail ?? []).slice();

/** A step from `from` to `from + 1` that records itself in `trail` and never touches its input. */
const step = (from: number, log: string[] = []): MigrationStep => ({
  from,
  migrate: (files) => {
    log.push(`${from}->${from + 1}`);
    const root = files['project.json'] as { trail?: string[] };
    return ok({
      ...files,
      'project.json': {
        ...root,
        manifestVersion: from + 1,
        trail: [...(root.trail ?? []), `${from}->${from + 1}`],
      },
    });
  },
});

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

describe('detectManifestVersion', () => {
  it('reads manifestVersion, and 0 when it is absent (the first format had none)', () => {
    expect(detectManifestVersion(at(1))).toBe(1);
    expect(detectManifestVersion(at(7))).toBe(7);
    expect(detectManifestVersion(at(undefined))).toBe(0);
  });

  it('is undefined for anything that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, '1', null, true, [], {}, Number.NaN]) {
      expect(
        detectManifestVersion(at(undefined, { manifestVersion: bad })),
        String(bad),
      ).toBeUndefined();
    }
  });

  it('is undefined when project.json is missing or is not an object', () => {
    expect(detectManifestVersion({})).toBeUndefined();
    for (const root of [null, [], 'text', 12]) {
      expect(detectManifestVersion({ 'project.json': root })).toBeUndefined();
    }
  });
});

describe('migratePackage', () => {
  it('returns a package already at the current version as it is', () => {
    const files = at(1, { marker: 'untouched' });
    const result = migratePackage(files, { steps: [], current: 1 });
    expect(result).toEqual({ ok: true, value: files });
    expect(result.ok && result.value).toBe(files);
  });

  it('refuses a package newer than the code, saying both versions (MANIFEST_UNSUPPORTED)', () => {
    const result = migratePackage(at(2), { steps: [], current: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_UNSUPPORTED');
    expect(result.error.details).toEqual({ found: 2, supported: 1 });
  });

  it('applies the steps in order, from the version found up to the current one', () => {
    const run = (version: number) => {
      const log: string[] = [];
      const steps = [step(0, log), step(1, log), step(2, log)];
      const result = migratePackage(at(version), { steps, current: 3 });
      return { log, result };
    };
    expect(run(0).log).toEqual(['0->1', '1->2', '2->3']);
    expect(run(1).log).toEqual(['1->2', '2->3']);
    expect(run(2).log).toEqual(['2->3']);
    expect(run(3).log).toEqual([]);

    const { result } = run(0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(trailOf(result.value)).toEqual(['0->1', '1->2', '2->3']);
    expect(detectManifestVersion(result.value)).toBe(3);
  });

  it('does not depend on the order the steps are declared in', () => {
    const result = migratePackage(at(0), { steps: [step(2), step(0), step(1)], current: 3 });
    expect(result.ok && trailOf(result.value)).toEqual(['0->1', '1->2', '2->3']);
  });

  it('refuses a package when a step is missing in the chain, after running the earlier ones', () => {
    const log: string[] = [];
    const result = migratePackage(at(0), { steps: [step(0, log), step(2, log)], current: 3 });
    expect(log).toEqual(['0->1']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_UNSUPPORTED');
    expect(result.error.message).toContain('no migration from manifest version 1');
  });

  it('stops at the first step that fails and returns its error unchanged', () => {
    const log: string[] = [];
    const failure = domainError('MANIFEST_INVALID', 'cannot migrate this');
    const failing: MigrationStep = { from: 1, migrate: () => err(failure) };
    const result = migratePackage(at(0), {
      steps: [step(0, log), failing, step(2, log)],
      current: 3,
    });
    expect(result).toEqual({ ok: false, error: failure });
    expect(log).toEqual(['0->1']);
  });

  it('throws when a step does not advance the version: that is a bug, not bad input', () => {
    const lazy: MigrationStep = { from: 0, migrate: (files) => ok(files) };
    expect(() => migratePackage(at(0), { steps: [lazy], current: 1 })).toThrow(
      /did not produce version 1/,
    );
    const skipping: MigrationStep = { from: 0, migrate: () => ok(at(5)) };
    expect(() => migratePackage(at(0), { steps: [skipping], current: 1 })).toThrow(
      /did not produce version 1/,
    );
  });

  it('refuses an unusable manifestVersion with a pointer to the property (MANIFEST_INVALID)', () => {
    const result = migratePackage(at(undefined, { manifestVersion: 'one' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_INVALID');
    expect(result.error.details).toMatchObject({
      issues: [{ file: 'project.json', path: '/manifestVersion' }],
    });
    expect(migratePackage({}).ok).toBe(false);
  });

  it('never modifies the package it is given', () => {
    const files = deepFreeze(at(0, { project: { name: 'legacy' }, nested: [{ a: 1 }] }));
    const snapshot = structuredClone(files);
    const result = migratePackage(files, { steps: [step(0)], current: 1 });
    expect(result.ok).toBe(true);
    expect(files).toEqual(snapshot);
  });

  it('gives the steps a context, with real UUID v7 identifiers by default', () => {
    const seen: MigrationContext[] = [];
    const spy: MigrationStep = {
      from: 0,
      migrate: (files, context) => {
        seen.push(context);
        return step(0).migrate(files, context) as Result<PackageFiles, never>;
      },
    };
    migratePackage(at(0), { steps: [spy], current: 1 });
    const [context] = seen;
    expect(isUuidV7(context?.newId('entity:e1') ?? '')).toBe(true);
    expect(context?.newId('a')).not.toBe(context?.newId('a'));

    const custom: MigrationContext = { newId: (hint) => `id-for-${hint}` };
    seen.length = 0;
    migratePackage(at(0), { steps: [spy], current: 1, context: custom });
    expect(seen[0]?.newId('x')).toBe('id-for-x');
  });

  it('has one real step per version change: only v0 to v1 while the format is at version 1', () => {
    expect(MIGRATIONS.map((step) => step.from)).toEqual([0]);
  });
});

describe('openPackage', () => {
  it('stops at the migration error and does not validate a package it could not migrate', () => {
    const result = openPackage(at(9), { steps: [], current: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_UNSUPPORTED');
  });

  it('validates the migrated package: a bad result is reported with its file and path', () => {
    const result = openPackage(at(1, { project: 'not an object' }), { steps: [], current: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_INVALID');
    const issues = (result.error.details as { issues: { file: string }[] }).issues;
    expect(issues.every((issue) => issue.file === 'project.json')).toBe(true);
  });
});
