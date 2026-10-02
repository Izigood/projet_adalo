import { isDomainError, isUuidV7 } from '@acs/domain';
import {
  detectManifestVersion,
  migratePackage,
  openPackage,
  validateFiles,
} from '@acs/project-schema';
import type { EntitiesFile, FileIssue, PackageFiles } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';
import {
  VALID_FIXTURES,
  consistencyProblems,
  legacyV0ExpectedV1,
  legacyV0Fixture,
  stableId,
} from './index.js';

const stable = { newId: (hint: string) => stableId(hint) as string };

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

describe('the legacy v0 fixture', () => {
  it('really is the old format: no manifestVersion, and not a valid v1 package', () => {
    const files = legacyV0Fixture();
    expect(detectManifestVersion(files)).toBe(0);
    expect(Object.keys(files)).toEqual(['project.json']);
    expect(validateFiles(files).ok).toBe(false);
  });

  it('migrates to exactly the v1 package written by hand', () => {
    const result = migratePackage(legacyV0Fixture(), { context: stable });
    expect(result.ok, JSON.stringify(result.ok ? null : result.error.details)).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(legacyV0ExpectedV1());
  });

  it('gives a valid and consistent v1 package', () => {
    const result = openPackage(legacyV0Fixture(), { context: stable });
    expect(result.ok, JSON.stringify(result.ok ? null : result.error.details)).toBe(true);
    expect(consistencyProblems(legacyV0ExpectedV1())).toEqual([]);
    expect(validateFiles(legacyV0ExpectedV1()).ok).toBe(true);
  });

  it('opens with real identifiers too: same content, new UUID v7 each time', () => {
    const first = openPackage(legacyV0Fixture());
    const second = openPackage(legacyV0Fixture());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(consistencyProblems(first.value)).toEqual([]);

    const describeEntities = (files: PackageFiles) =>
      (files['schema/entities.json'] as EntitiesFile).entities.map((entity) => ({
        key: entity.key,
        fields: entity.fields.map((field) => [field.key, field.type]),
      }));
    expect(describeEntities(first.value)).toEqual(describeEntities(legacyV0ExpectedV1()));

    const idsOf = (files: PackageFiles) =>
      (files['schema/entities.json'] as EntitiesFile).entities.map((entity) => entity.id);
    for (const id of [...idsOf(first.value), ...idsOf(second.value)])
      expect(isUuidV7(id)).toBe(true);
    expect(idsOf(first.value)).not.toEqual(idsOf(second.value));
    expect(idsOf(first.value)).not.toEqual(idsOf(legacyV0ExpectedV1()));
  });

  it('is not modified by the migration', () => {
    const files = deepFreeze(legacyV0Fixture());
    const snapshot = structuredClone(files);
    expect(migratePackage(files, { context: stable }).ok).toBe(true);
    expect(files).toEqual(snapshot);
  });

  it('migrating the result again changes nothing', () => {
    const once = migratePackage(legacyV0Fixture(), { context: stable });
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = migratePackage(once.value, { context: stable });
    expect(twice.ok && twice.value).toBe(once.value);
  });

  it('reports a defect of the old package against the old package, not against v1', () => {
    const files = legacyV0Fixture();
    const doc = files['project.json'] as { entities: { fields: { type: string }[] }[] };
    (doc.entities[1] as { fields: { type: string }[] }).fields[2]!.type = 'timestamp';
    const result = openPackage(files, { context: stable });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isDomainError(result.error)).toBe(true);
    const issues = (result.error.details as { issues: FileIssue[] }).issues;
    expect(issues).toMatchObject([
      { file: 'project.json', keyword: 'enum', path: '/entities/1/fields/2/type' },
    ]);
  });
});

describe.each(Object.keys(VALID_FIXTURES))('current-format fixture %s', (name) => {
  const build = () => (VALID_FIXTURES[name] as () => PackageFiles)();

  it('is already at the current version: migration hands it back as it is', () => {
    const files = build();
    const result = migratePackage(files);
    expect(result.ok && result.value).toBe(files);
  });

  it('opens without any change', () => {
    const files = build();
    const result = openPackage(files);
    expect(result.ok && result.value).toBe(files);
  });

  it('is refused once it claims a newer format version, with both versions given', () => {
    const files = build();
    (files['project.json'] as { manifestVersion: number }).manifestVersion = 2;
    const result = openPackage(files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_UNSUPPORTED');
    expect(result.error.details).toEqual({ found: 2, supported: 1 });
  });
});
