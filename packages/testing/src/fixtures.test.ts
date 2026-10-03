import { isDomainError } from '@acs/domain';
import { schemaForPath, validateFiles } from '@acs/project-schema';
import type { EntitiesFile, PackageFiles, ProjectManifest } from '@acs/project-schema';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VALID_FIXTURES,
  consistencyProblems,
  minimalFixture,
  referenceFixture,
  responsiveFixture,
} from './index.js';

const names = Object.keys(VALID_FIXTURES);

describe.each(names)('valid fixture %s', (name) => {
  const build = () => (VALID_FIXTURES[name] as () => PackageFiles)();

  it('passes the validation of every file of the package', () => {
    const result = validateFiles(build());
    expect(result.ok, JSON.stringify(result.ok ? null : result.error.details)).toBe(true);
  });

  it('contains every file its own project.json names, and nothing the layout does not know', () => {
    const files = build();
    const { entries } = files['project.json'] as ProjectManifest;
    for (const path of [
      entries.schema,
      entries.roles,
      entries.pages,
      entries.queries,
      ...entries.themes,
      ...entries.workflows,
    ]) {
      expect(Object.keys(files), path).toContain(path);
    }
    expect(Object.keys(files).filter((path) => schemaForPath(path) === undefined)).toEqual([]);
  });

  it('is internally consistent: every reference designates something that exists', () => {
    expect(consistencyProblems(build())).toEqual([]);
  });

  it('is deterministic and each call returns an independent copy', () => {
    const first = build();
    expect(build()).toEqual(first);
    (first['project.json'] as ProjectManifest).project.name = 'modified';
    expect((build()['project.json'] as ProjectManifest).project.name).not.toBe('modified');
  });

  it('survives a JSON round trip unchanged and still valid (it is plain JSON)', () => {
    const files = build();
    const roundTripped = JSON.parse(JSON.stringify(files)) as PackageFiles;
    expect(roundTripped).toEqual(files);
    expect(validateFiles(roundTripped).ok).toBe(true);
  });
});

describe('minimal fixture', () => {
  it('has one page, one theme and no data', () => {
    const files = minimalFixture();
    const entities = files['schema/entities.json'] as EntitiesFile;
    expect(entities.entities).toEqual([]);
    expect(entities.relations).toEqual([]);
    expect(Object.keys(files).filter((path) => schemaForPath(path) === 'Page')).toHaveLength(1);
    expect(Object.keys(files).filter((path) => schemaForPath(path) === 'Theme')).toHaveLength(1);
  });
});

describe('reference fixture', () => {
  it('has two entities linked by one 1-N relation that blocks deletion', () => {
    const files = referenceFixture();
    const { entities, relations } = files['schema/entities.json'] as EntitiesFile;
    expect(entities.map((entity) => entity.key)).toEqual(['customer', 'order']);
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      source: entities[0]?.id,
      target: entities[1]?.id,
      cardinality: '1-N',
      onDelete: 'restrict',
    });
  });

  it('is rejected as a package once its manifest is damaged, with the file and path', () => {
    const files = referenceFixture();
    (files['project.json'] as { project: { key: string } }).project.key = 'crm';
    const result = validateFiles(files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isDomainError(result.error)).toBe(true);
    const issues = (result.error.details as { issues: { file: string; path: string }[] }).issues;
    expect(issues).toMatchObject([{ file: 'project.json', path: '/project/key' }]);
  });
});

describe('the title the E2E suite expects', () => {
  it('is the text of the single node of the minimal fixture', () => {
    const files = minimalFixture();
    const pagePath = Object.keys(files).find((path) => schemaForPath(path) === 'Page') as string;
    const page = files[pagePath] as { nodes: Record<string, { props: { text: string } }> };
    const [node] = Object.values(page.nodes);
    const targets = readFileSync(resolve(import.meta.dirname, '../../../e2e/targets.ts'), 'utf8');
    expect(/MINIMAL_TITLE = '([^']+)'/.exec(targets)?.[1]).toBe(node?.props.text);
  });

  it('is the level 1 title of the responsive fixture', () => {
    const files = responsiveFixture();
    const pagePath = Object.keys(files).find((path) => schemaForPath(path) === 'Page') as string;
    const page = files[pagePath] as {
      nodes: Record<string, { component: string; props: { text?: string; level?: number } }>;
    };
    const title = Object.values(page.nodes).find(
      (node) => node.component === 'info.title@1' && node.props.level === 1,
    );
    const targets = readFileSync(resolve(import.meta.dirname, '../../../e2e/targets.ts'), 'utf8');
    expect(/RESPONSIVE_TITLE = '([^']+)'/.exec(targets)?.[1]).toBe(title?.props.text);
  });
});
