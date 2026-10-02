import { err, ok } from '@acs/domain';
import type { IdentityProvider } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import {
  CORRUPTED_FIXTURES,
  VALID_FIXTURES,
  completeFixture,
  legacyV0Fixture,
  minimalFixture,
} from '@acs/testing';
import type { FixtureFiles } from '@acs/testing';
import { boot } from './boot.js';
import type { FileSource } from './file-source.js';

const memory =
  (files: FixtureFiles): FileSource =>
  (path) =>
    Promise.resolve(
      Object.hasOwn(files, path)
        ? ok(structuredClone(files[path]))
        : err('the server answered 404'),
    );

type Issue = { file: string; keyword: string; path: string };
const failure = async (files: FixtureFiles) => {
  const result = await boot({ source: memory(files) });
  if (result.ok) throw new Error('the boot was expected to fail');
  return {
    code: result.error.code,
    issues: ((result.error.details as { issues?: Issue[] } | undefined)?.issues ?? []).map(
      (issue) => `${issue.file} ${issue.keyword} ${issue.path}`,
    ),
  };
};

describe('boot', () => {
  it('starts the minimal project: its initial route, its theme, its pages and a local user', async () => {
    const result = await boot({ source: memory(minimalFixture()) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.table.initial.path).toBe('/');
    expect(result.value.pages.size).toBe(1);
    expect(result.value.theme.modes.dark['color.surface']).toBe('#12151b');
    expect(result.value.manifest.project.key).toBe('MINI');
    expect(result.value.user).toMatchObject({ displayName: 'Utilisateur local', locale: 'fr-FR' });
  });

  it.each(Object.entries(VALID_FIXTURES))('starts the %s fixture', async (_name, build) => {
    expect((await boot({ source: memory(build()) })).ok).toBe(true);
  });

  it('starts a package of the first format after migrating it', async () => {
    const result = await boot({ source: memory(legacyV0Fixture()) });
    expect(result.ok && result.value.table.routes.length).toBeGreaterThan(0);
  });

  it.each(CORRUPTED_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    'refuses the corrupted package, naming the file and the JSON path: %s',
    async (_name, fixture) => {
      const { files, expected } = fixture.build();
      const { code, issues } = await failure(files);
      // A newer format is refused as unsupported, not as invalid (dedicated test below).
      if (code === 'MANIFEST_UNSUPPORTED') {
        expect(fixture.name).toContain('future format');
        return;
      }
      for (const issue of expected) expect(issues, issue).toContain(issue);
    },
  );

  it('refuses a manifest of a newer format with MANIFEST_UNSUPPORTED', async () => {
    const files = minimalFixture();
    (files['project.json'] as { manifestVersion: number }).manifestVersion = 2;
    expect((await failure(files)).code).toBe('MANIFEST_UNSUPPORTED');
  });

  it('refuses a default theme that no file of the package provides', async () => {
    const files = minimalFixture();
    const root = files['project.json'] as { project: { defaultThemeId: string } };
    root.project.defaultThemeId = '01890a5d-ac96-774b-bcce-b302099a8057';
    expect((await failure(files)).issues).toEqual([
      'project.json reference /project/defaultThemeId',
    ]);
  });

  it('refuses an index whose initial page has no route', async () => {
    const files = minimalFixture();
    (files['pages/index.json'] as { initialPageId: string }).initialPageId =
      '01890a5d-ac96-774b-bcce-b302099a8057';
    expect((await failure(files)).issues).toEqual(['pages/index.json reference /initialPageId']);
  });

  it('reports a file that cannot be read before looking at anything else', async () => {
    const files = minimalFixture();
    delete files[
      'themes/' +
        Object.keys(files)
          .find((p) => p.startsWith('themes/'))!
          .slice(7)
    ];
    const { issues } = await failure(files);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^themes\/.+ missing-file \/$/);
  });

  it('asks the identity provider, built for the locale of the project', async () => {
    const files = completeFixture();
    const locales: string[] = [];
    const guest: IdentityProvider = {
      kind: 'local',
      current: () => Promise.resolve(null),
      signIn: () => Promise.reject(new Error('unused')),
      signOut: () => Promise.resolve(),
    };
    const result = await boot({
      source: memory(files),
      identity: (locale) => {
        locales.push(locale);
        return guest;
      },
    });
    expect(locales).toEqual([
      (files['project.json'] as { project: { locale: string } }).project.locale,
    ]);
    expect(result.ok && result.value.user).toBeNull();
    expect(result.ok && result.value.identity).toBe(guest);
  });
});
