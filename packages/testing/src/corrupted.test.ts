import { isDomainError } from '@acs/domain';
import { validateFiles } from '@acs/project-schema';
import type { FileIssue } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';
import { CORRUPTED_FIXTURES, VALID_FIXTURES } from './index.js';

const found = (issues: FileIssue[]) => issues.map((i) => `${i.file} ${i.keyword} ${i.path}`).sort();

describe('corrupted fixtures', () => {
  it.each(CORRUPTED_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    'are rejected with the exact file, keyword and JSON path: %s',
    (_name, fixture) => {
      const { files, expected } = fixture.build();
      const result = validateFiles(files);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(isDomainError(result.error)).toBe(true);
      expect(result.error.code).toBe('MANIFEST_INVALID');
      const issues = (result.error.details as { issues: FileIssue[] }).issues;
      expect(found(issues)).toEqual([...expected].sort());
    },
  );

  it('each starts from a package that is valid: the defect alone makes it fail', () => {
    for (const build of Object.values(VALID_FIXTURES)) expect(validateFiles(build()).ok).toBe(true);
  });

  it('are independent: building one twice gives equal results and no shared state', () => {
    for (const fixture of CORRUPTED_FIXTURES) {
      const first = fixture.build();
      const second = fixture.build();
      expect(second).toEqual(first);
      expect(second.files).not.toBe(first.files);
    }
  });

  it('have unique names and cover every category, secrets included (EF-SEC-04)', () => {
    const names = CORRUPTED_FIXTURES.map((fixture) => fixture.name);
    expect(new Set(names).size).toBe(names.length);
    const categories = new Set(CORRUPTED_FIXTURES.map((fixture) => fixture.category));
    expect([...categories].sort()).toEqual(
      ['data-model', 'other', 'secrets', 'structure', 'theme', 'ui', 'workflow'].sort(),
    );
    const secrets = CORRUPTED_FIXTURES.filter((fixture) => fixture.category === 'secrets');
    expect(secrets.length).toBeGreaterThanOrEqual(5);
  });

  it('reports a precise JSON path for every defect, never the document root alone', () => {
    const rootOnly = CORRUPTED_FIXTURES.filter((fixture) =>
      fixture.build().expected.every((issue) => issue.endsWith(' /')),
    );
    expect(rootOnly.map((fixture) => fixture.name).sort()).toEqual([
      'a file that is not an object',
      'a package without project.json',
    ]);
  });
});
