import { err, ok } from '@acs/domain';
import { describe, expect, it, vi } from 'vitest';
import { legacyV0Fixture, minimalFixture, referenceFixture, completeFixture } from '@acs/testing';
import type { FixtureFiles } from '@acs/testing';
import { httpFileSource } from './file-source.js';
import type { FileSource } from './file-source.js';
import { loadPackage } from './load-package.js';

/** A source reading a map; it records every path it is asked for. */
function memory(files: FixtureFiles): { source: FileSource; asked: string[] } {
  const asked: string[] = [];
  const source: FileSource = (path) => {
    asked.push(path);
    return Promise.resolve(
      Object.hasOwn(files, path)
        ? ok(structuredClone(files[path]))
        : err('the server answered 404'),
    );
  };
  return { source, asked };
}

const issuesOf = (result: Awaited<ReturnType<typeof loadPackage>>) =>
  result.ok
    ? []
    : (result.error.details as { issues: { file: string; keyword: string }[] }).issues.map(
        (issue) => `${issue.file} ${issue.keyword}`,
      );

describe('loadPackage', () => {
  it.each([
    ['minimal', minimalFixture],
    ['reference', referenceFixture],
    ['complete', completeFixture],
  ])('reads every file of the %s package, and no other', async (_name, build) => {
    const files = build();
    const { source, asked } = memory(files);
    const result = await loadPackage(source);
    expect(result.ok && Object.keys(result.value).sort()).toEqual(Object.keys(files).sort());
    expect(asked.every((path) => Object.hasOwn(files, path))).toBe(true);
  });

  it('names the file that is missing', async () => {
    const files = minimalFixture();
    const page = Object.keys(files).find((path) => /^pages\/[0-9a-f-]{36}\.json$/.test(path));
    delete files[page as string];
    expect(issuesOf(await loadPackage(memory(files).source))).toEqual([`${page} missing-file`]);
  });

  it('reports every missing file at once', async () => {
    const files = minimalFixture();
    delete files['schema/roles.json'];
    delete files['queries/index.json'];
    expect(issuesOf(await loadPackage(memory(files).source)).sort()).toEqual([
      'queries/index.json missing-file',
      'schema/roles.json missing-file',
    ]);
  });

  it('refuses a package without project.json', async () => {
    expect(issuesOf(await loadPackage(memory({}).source))).toEqual(['project.json missing-file']);
  });

  it('asks only for project.json when the format is older, since openPackage migrates it', async () => {
    const { source, asked } = memory(legacyV0Fixture());
    const result = await loadPackage(source);
    expect(asked).toEqual(['project.json']);
    expect(result.ok && Object.keys(result.value)).toEqual(['project.json']);
  });

  it('leaves a newer or unreadable manifest to openPackage, which refuses it', async () => {
    const newer = minimalFixture();
    (newer['project.json'] as { manifestVersion: number }).manifestVersion = 2;
    const { source, asked } = memory(newer);
    expect((await loadPackage(source)).ok).toBe(true);
    expect(asked).toEqual(['project.json']);
    expect((await loadPackage(memory({ 'project.json': 'garbage' }).source)).ok).toBe(true);
  });

  it('does not stumble on entries that are not what the schema says', async () => {
    const files = minimalFixture();
    const root = files['project.json'] as { entries: Record<string, unknown> };
    root.entries['themes'] = 'themes/x.json';
    root.entries['schema'] = 42;
    root.entries['pages'] = null;
    const result = await loadPackage(memory(files).source);
    expect(result.ok).toBe(true);
  });

  it('never builds a page path out of something that is not an identifier', async () => {
    const files = minimalFixture();
    (files['pages/index.json'] as { routes: { pageId: string }[] }).routes[0]!.pageId = '../secret';
    const { source, asked } = memory(files);
    await loadPackage(source);
    expect(asked.some((path) => path.includes('secret'))).toBe(false);
  });
});

describe('httpFileSource', () => {
  const base = 'https://app.test/release/project/';
  const respond = (body: BodyInit, status = 200) =>
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status })));

  it('reads a JSON file under the project folder', async () => {
    const fetchFile = respond('{"a":1}');
    const result = await httpFileSource(base, fetchFile)('pages/index.json');
    expect(result).toEqual(ok({ a: 1 }));
    expect(String(fetchFile.mock.calls[0]?.[0])).toBe(
      'https://app.test/release/project/pages/index.json',
    );
  });

  it('says why a file could not be read', async () => {
    expect(await httpFileSource(base, respond('', 404))('x.json')).toEqual(
      err('the server answered 404'),
    );
    expect(await httpFileSource(base, respond('<html>'))('x.json')).toEqual(
      err('the file is not valid JSON'),
    );
    const down = vi.fn(() => Promise.reject(new TypeError('offline')));
    expect(await httpFileSource(base, down)('x.json')).toEqual(
      err('the file could not be fetched'),
    );
  });

  it('refuses a path that leaves the project folder, without fetching it', async () => {
    const fetchFile = respond('{}');
    const read = httpFileSource(base, fetchFile);
    for (const path of ['../other.json', '/other.json', 'https://evil.test/x.json']) {
      expect(await read(path), path).toEqual(err('the path leaves the project folder'));
    }
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
