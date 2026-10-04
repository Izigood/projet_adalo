import { baseTokens, darkTokens, lightTokens } from '@acs/design-system';
import { UUID_V7_PATTERN } from '@acs/domain';
import type { DomainError } from '@acs/domain';
import { validateFiles } from '@acs/project-schema';
import type { FileIssue } from '@acs/project-schema';
import { CORRUPTED_FIXTURES, VALID_FIXTURES } from '@acs/testing';
import { describe, expect, it } from 'vitest';
import fr from '../locales/fr.json';
import { createProject } from './create-project.js';
import { fromFiles, summaryOf, toFiles } from './project-state.js';
import { createProjectStore } from './project-store.js';

const issuesOf = (error: DomainError): FileIssue[] =>
  (error.details as { issues: FileIssue[] }).issues;

function created(overrides: Partial<Parameters<typeof createProject>[0]> = {}) {
  const result = createProject({ key: 'DEMO', name: 'Demo', ...overrides });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Every identifier a state holds, wherever it is: project, pages, nodes, themes. */
function identifiersOf(value: unknown): string[] {
  const text = JSON.stringify(value);
  return text.match(new RegExp(UUID_V7_PATTERN.slice(1, -1), 'g')) ?? [];
}

describe('createProject (EF-PRJ-01)', () => {
  it('creates a project with the metadata of the requirement, as a package that passes the schemas', () => {
    const state = created({ description: 'Un essai', author: 'Ada' });
    expect(state.project).toMatchObject({
      key: 'DEMO',
      name: 'Demo',
      description: 'Un essai',
      author: 'Ada',
      version: '0.1.0',
      locale: 'fr-FR',
      storageMode: 'local',
    });
    expect(state.project.id).toMatch(new RegExp(UUID_V7_PATTERN));
    expect(validateFiles(toFiles(state)).ok).toBe(true);
  });

  it('opens on a first page with a title, and uses the default theme', () => {
    const state = created({ name: 'Mon appli' });
    const pageId = state.initialPageId;
    const page = state.pages.byId[pageId];
    expect(state.pages.order).toEqual([pageId]);
    expect(state.routes).toEqual([{ pageId, route: '/' }]);
    expect(page?.nodes[page.rootNodeId]?.props).toEqual({ text: 'Mon appli' });
    const theme = state.themes.byId[state.project.defaultThemeId];
    expect(theme?.name).toBe(fr['project.defaultTheme']);
    expect(theme?.tokens).toEqual(baseTokens);
    expect(theme?.modes).toEqual({ light: lightTokens, dark: darkTokens });
  });

  it('gives every project identifiers of its own', () => {
    const first = identifiersOf(created());
    const second = identifiersOf(created());
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
  });

  it.each([
    ['a key in lower case', { key: 'demo' }, '/project/key'],
    ['a key of one letter', { key: 'D' }, '/project/key'],
    ['a key of 17 characters', { key: 'A'.repeat(17) }, '/project/key'],
    ['an empty name', { name: '' }, '/project/name'],
    ['a locale that is not a language tag', { locale: 'francais' }, '/project/locale'],
  ])('refuses %s, and says which field', (_label, given, pointer) => {
    const result = createProject({ key: 'DEMO', name: 'Demo', ...given });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MANIFEST_INVALID');
    expect(issuesOf(result.error).map((issue) => `${issue.file} ${issue.path}`)).toContain(
      `project.json ${pointer}`,
    );
  });
});

describe('the normalised state (ARC-STU-01)', () => {
  it.each(Object.entries(VALID_FIXTURES))(
    'gives back the same files as the fixture %s, so that saving changes nothing',
    (_name, fixture) => {
      const files = fixture();
      const state = fromFiles(files);
      expect(state.ok).toBe(true);
      if (!state.ok) return;
      expect(toFiles(state.value)).toEqual(files);
    },
  );

  it.each(CORRUPTED_FIXTURES.map((entry) => [entry.name, entry] as const))(
    'refuses the corrupted package: %s',
    (_name, entry) => {
      expect(fromFiles(entry.build().files).ok).toBe(false);
    },
  );

  it('refuses a project.json that names a file the package does not have', () => {
    const files = VALID_FIXTURES['minimal']?.() ?? {};
    const themePath = (files['project.json'] as { entries: { themes: string[] } }).entries
      .themes[0] as string;
    delete files[themePath];
    const result = fromFiles(files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ missing: [themePath] });
  });

  it('reaches every object by its identifier, in the order of the package', () => {
    const files = VALID_FIXTURES['reference']?.() ?? {};
    const state = fromFiles(files);
    if (!state.ok) throw new Error(state.error.message);
    const { pages, entities } = state.value;
    expect(pages.order.length).toBeGreaterThan(1);
    expect(pages.order.map((id) => pages.byId[id]?.id)).toEqual(pages.order);
    expect(entities.order.map((id) => entities.byId[id]?.id)).toEqual(entities.order);
    expect(state.value.routes.map((route) => route.pageId)).toEqual(
      pages.order.filter((id) => state.value.routes.some((route) => route.pageId === id)),
    );
  });

  it('keeps the files it does not edit', () => {
    const files = { ...(VALID_FIXTURES['minimal']?.() ?? {}), 'README.md': 'une note' };
    const state = fromFiles(files);
    if (!state.ok) throw new Error(state.error.message);
    expect(toFiles(state.value)['README.md']).toBe('une note');
  });

  it('gives the summary of the catalogue from the project, and nothing else', () => {
    const state = created({ description: 'Un essai', author: 'Ada' });
    expect(summaryOf(state)).toEqual({
      id: state.project.id,
      key: 'DEMO',
      name: 'Demo',
      description: 'Un essai',
      author: 'Ada',
      version: '0.1.0',
      locale: 'fr-FR',
    });
  });
});

describe('the store of the open project', () => {
  it('lets a component look and be told, and nothing else', () => {
    const { view } = createProjectStore();
    expect(Object.keys(view).sort()).toEqual(['getState', 'subscribe']);
    expect(view.getState()).toBeNull();
  });

  it('tells the subscribers of each change, until they stop', () => {
    const { view, writer } = createProjectStore();
    let calls = 0;
    const stop = view.subscribe(() => (calls += 1));
    writer.replace(created());
    writer.close();
    expect(calls).toBe(2);
    stop();
    writer.replace(created());
    expect(calls).toBe(2);
  });

  it('holds the project frozen: changing it in place throws, wherever it is', () => {
    const { view, writer } = createProjectStore();
    const state = created();
    writer.replace(state);
    const open = view.getState();
    if (open === null) throw new Error('no project');
    const page = open.pages.byId[open.initialPageId];
    expect(() => {
      (open.project as { name: string }).name = 'Changed';
    }).toThrow(TypeError);
    expect(() => {
      (page as { key: string }).key = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      (open.pages.order as string[]).push('x');
    }).toThrow(TypeError);
    expect(view.getState()?.project.name).toBe('Demo');
  });
});
