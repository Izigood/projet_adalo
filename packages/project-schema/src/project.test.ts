import { newId } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { STORAGE_MODES, VERSION_STATUSES, validate } from './index.js';
import type { Issue, SchemaName } from './index.js';

const without = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

function issuesOf(name: SchemaName, document: unknown): string[] {
  const result = validate(name, document);
  if (result.ok) return [];
  return (result.error.details as { issues: Issue[] }).issues.map(
    (issue) => `${issue.keyword} ${issue.path}`,
  );
}

const project = (extra: Record<string, unknown> = {}) => ({
  id: newId<'project'>(),
  key: 'ACS',
  name: 'App Canvas Studio',
  description: 'Suivi des actions',
  author: 'dlartigue',
  version: '1.0.0',
  locale: 'fr-FR',
  defaultThemeId: newId<'theme'>(),
  storageMode: 'local',
  ...extra,
});

describe('project', () => {
  it('accepts a complete project, including empty description and author', () => {
    expect(issuesOf('Project', project())).toEqual([]);
    expect(issuesOf('Project', project({ description: '', author: '' }))).toEqual([]);
  });

  it('applies the project key rule of RG-11', () => {
    for (const key of ['acs', 'A', 'A'.repeat(17), '1AB', 'AC-S']) {
      expect(issuesOf('Project', project({ key }))).toEqual(['pattern /key']);
    }
  });

  it('points at a bad id, version, locale or default theme', () => {
    expect(issuesOf('Project', project({ id: 'acs' }))).toEqual(['pattern /id']);
    expect(issuesOf('Project', project({ version: '1.0' }))).toEqual(['pattern /version']);
    expect(issuesOf('Project', project({ locale: 'francais' }))).toEqual(['pattern /locale']);
    expect(issuesOf('Project', project({ defaultThemeId: 'dark' }))).toEqual([
      'pattern /defaultThemeId',
    ]);
    expect(issuesOf('Project', project({ name: '' }))).toEqual(['minLength /name']);
  });

  it('only knows the local storage mode at the MVP (decision D-03)', () => {
    expect(STORAGE_MODES).toEqual(['local']);
    expect(issuesOf('Project', project({ storageMode: 'remote' }))).toEqual(['enum /storageMode']);
  });

  it('requires every attribute and refuses extra ones, such as a password', () => {
    for (const name of [
      'id',
      'key',
      'name',
      'description',
      'author',
      'version',
      'locale',
      'defaultThemeId',
      'storageMode',
    ]) {
      expect(issuesOf('Project', without(project(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('Project', project({ password: 'x' }))).toEqual([
      'additionalProperties /password',
    ]);
  });
});

describe('project version', () => {
  const version = (extra: Record<string, unknown> = {}) => ({
    semver: '1.2.0',
    status: 'draft',
    manifestVersion: 1,
    notes: '',
    ...extra,
  });

  it('accepts a draft without checksum or date, and a published version with both', () => {
    expect(issuesOf('ProjectVersion', version())).toEqual([]);
    const published = version({
      status: 'published',
      checksum: 'a'.repeat(64),
      publishedAt: '2026-10-02T14:03:07Z',
    });
    expect(issuesOf('ProjectVersion', published)).toEqual([]);
  });

  it('accepts the four statuses of dossier 6.2 and nothing else', () => {
    expect([...VERSION_STATUSES]).toEqual(['draft', 'frozen', 'published', 'archived']);
    for (const status of VERSION_STATUSES) {
      expect(issuesOf('ProjectVersion', version({ status }))).toEqual([]);
    }
    expect(issuesOf('ProjectVersion', version({ status: 'deleted' }))).toEqual(['enum /status']);
  });

  it('points at a bad version number, manifest version, checksum or date', () => {
    expect(issuesOf('ProjectVersion', version({ semver: 'v1' }))).toEqual(['pattern /semver']);
    expect(issuesOf('ProjectVersion', version({ manifestVersion: 0 }))).toEqual([
      'minimum /manifestVersion',
    ]);
    expect(issuesOf('ProjectVersion', version({ manifestVersion: 1.5 }))).toEqual([
      'type /manifestVersion',
    ]);
    expect(issuesOf('ProjectVersion', version({ checksum: 'abc' }))).toEqual(['pattern /checksum']);
    expect(issuesOf('ProjectVersion', version({ publishedAt: '2026-10-02' }))).toEqual([
      'pattern /publishedAt',
    ]);
  });
});

describe('theme', () => {
  const theme = (extra: Record<string, unknown> = {}) => ({
    id: newId<'theme'>(),
    name: 'Thème par défaut',
    tokens: { 'space.1': '0.25rem', 'font.family.sans': "system-ui, 'Segoe UI', sans-serif" },
    modes: {
      light: { 'color.surface': '#ffffff', 'shadow.sm': '0 1px 2px rgb(0 0 0 / 0.12)' },
      dark: { 'color.surface': '#12151b' },
    },
    assets: {},
    ...extra,
  });

  it('accepts base tokens, per-mode tokens and assets', () => {
    expect(issuesOf('Theme', theme())).toEqual([]);
    const withAssets = theme({
      assets: { logo: `assets/${'a'.repeat(64)}.svg`, icon: `assets/${'b'.repeat(64)}.png` },
    });
    expect(issuesOf('Theme', withAssets)).toEqual([]);
    expect(issuesOf('Theme', theme({ tokens: {}, modes: { light: {}, dark: {} } }))).toEqual([]);
  });

  it('accepts the usual CSS values: colours, lengths, calc(), font stacks, shadows', () => {
    const values = [
      '#fff',
      'rgb(0 0 0 / 0.12)',
      'hsl(210, 50%, 40%)',
      'calc(1rem + 2px)',
      '0.5rem',
      "ui-monospace, 'Cascadia Code', Menlo, monospace",
      '0 4px 12px rgb(0 0 0 / 0.16)',
      'var(--acs-space-2)',
    ];
    for (const value of values) {
      expect(issuesOf('Theme', theme({ tokens: { 'x.value': value } }))).toEqual([]);
    }
  });

  it('refuses a token name that is not dotted lower-case words', () => {
    for (const name of [
      'Color.surface',
      'color_surface',
      'color..surface',
      '.color',
      'color.',
      'a b',
    ]) {
      expect(issuesOf('Theme', theme({ tokens: { [name]: '#fff' } }))).toEqual([
        `additionalProperties /tokens/${name}`,
      ]);
    }
  });

  it('refuses CSS injection in a token value: it cannot end the rule or load anything', () => {
    const attacks = [
      'red; } body { display: none',
      'red}',
      '{',
      '</style><script>alert(1)</script>',
      'url(https://evil.example/x.png)',
      'URL(x)',
      'Url (x)',
      'image-set(x 1x)',
      'IMAGE-SET (x 1x)',
      'expression(alert(1))',
      'cross-fade("https://evil.example/a", red 50%)',
      'Image(x)',
      'src (x)',
      'element(#a)',
      'paint(x)',
      'red /* swallows what follows',
      'red\\;',
      '@import "x"',
      'red !important',
      'red\nblue',
      '',
      'x'.repeat(201),
    ];
    for (const value of attacks) {
      expect(
        issuesOf('Theme', theme({ tokens: { 'color.evil': value } })),
        JSON.stringify(value),
      ).toEqual(['pattern /tokens/color.evil']);
    }
  });

  it('applies the same value rules inside the light and dark modes', () => {
    expect(
      issuesOf('Theme', theme({ modes: { light: {}, dark: { 'color.surface': 'url(x)' } } })),
    ).toEqual(['pattern /modes/dark/color.surface']);
  });

  it('refuses an asset path that is not a hashed file of the package', () => {
    for (const logo of [
      'logo.png',
      `assets/${'a'.repeat(64)}`,
      '../assets/x.png',
      `assets/${'A'.repeat(64)}.png`,
    ]) {
      expect(issuesOf('Theme', theme({ assets: { logo } }))).toEqual(['pattern /assets/logo']);
    }
    expect(
      issuesOf('Theme', theme({ assets: { banner: `assets/${'a'.repeat(64)}.png` } })),
    ).toEqual(['additionalProperties /assets/banner']);
  });

  it('requires id, name, tokens, modes and assets, and both modes', () => {
    for (const name of ['id', 'name', 'tokens', 'modes', 'assets']) {
      expect(issuesOf('Theme', without(theme(), name))).toEqual([`required /${name}`]);
    }
    expect(issuesOf('Theme', theme({ modes: { light: {} } }))).toEqual(['required /modes/dark']);
    expect(issuesOf('Theme', theme({ modes: { light: {}, dark: {}, sepia: {} } }))).toEqual([
      'additionalProperties /modes/sepia',
    ]);
  });
});
