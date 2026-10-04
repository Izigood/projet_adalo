import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import fr from './locales/fr.json';

/**
 * ENF-10: the labels of the interface are in locales/fr.json, never in a component. These controls
 * read the code, and each has its negative control: a sample that breaks the rule must be found.
 */

/** Attributes whose value a person reads or hears. */
const LABEL_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'placeholder',
  'title',
  'alt',
  'label',
]);

const hasLetters = (text: string) => /\p{L}/u.test(text);

/** The text a component writes in the page itself instead of taking it from `t()`. */
function findHardcodedText(source: string): string[] {
  const file = ts.createSourceFile(
    'sample.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const literal = (node: ts.Node | undefined): string | undefined =>
    node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      ? node.text
      : undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && hasLetters(node.text)) found.push(node.text.trim());
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      const text = literal(node.expression);
      if (text !== undefined && hasLetters(text)) found.push(text);
    }
    if (ts.isJsxAttribute(node) && LABEL_ATTRIBUTES.has(node.name.getText(file))) {
      const direct = literal(node.initializer);
      const inExpression =
        node.initializer !== undefined && ts.isJsxExpression(node.initializer)
          ? literal(node.initializer.expression)
          : undefined;
      const text = direct ?? inExpression;
      if (text !== undefined && hasLetters(text)) found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('no text in a component (negative control of the gate)', () => {
  it.each([
    ['text between tags', '<button>Enregistrer</button>', 'Enregistrer'],
    ['text next to an element', '<p>Bonjour <b>{name}</b></p>', 'Bonjour'],
    ['a string in braces', "<p>{'Texte'}</p>", 'Texte'],
    ['a template in braces', '<p>{`Texte`}</p>', 'Texte'],
    ['a placeholder', '<input placeholder="Nom du projet" />', 'Nom du projet'],
    ['an aria-label', '<nav aria-label="Menu principal" />', 'Menu principal'],
    ['an aria-label in braces', "<nav aria-label={'Menu'} />", 'Menu'],
    ['a title', '<button title="Annuler">{label}</button>', 'Annuler'],
    ['an alt', '<img alt="Logo" />', 'Logo'],
    ['accented text', '<span>Été</span>', 'Été'],
  ])('finds %s', (_name, source, expected) => {
    expect(findHardcodedText(source)).toContain(expected);
  });

  it.each([
    ['a label taken from t()', "<button>{t('history.undo')}</button>"],
    ['an aria-label taken from t()', "<nav aria-label={t('zone.nav')} />"],
    ['a value that is data', '<span>{open.project.name}</span>'],
    ['a count', '<span>{count}</span>'],
    ['a class name and a type', '<button type="button" className="zone zone-top" />'],
    ['punctuation and digits only', '<span>/</span>'],
    ['an aria attribute that is not read', '<output aria-live="polite" />'],
    ['a key that is a literal passed to t()', "<p>{t('studio.subtitle')}</p>"],
  ])('accepts %s', (_name, source) => {
    expect(findHardcodedText(source)).toEqual([]);
  });
});

const here = dirname(fileURLToPath(import.meta.url));

/** The source files of the Studio that are not tests. */
function sources(extension: RegExp): { path: string; text: string }[] {
  return readdirSync(here, { recursive: true, encoding: 'utf8' })
    .filter((path) => extension.test(path) && !/\.test\.[tj]sx?$/.test(path))
    .map((path) => ({
      path: relative(here, join(here, path)),
      text: readFileSync(join(here, path), 'utf8'),
    }));
}

describe('the components of the Studio (ENF-10)', () => {
  it('write no text of their own: every label comes from locales/fr.json', () => {
    const files = sources(/\.tsx$/);
    expect(files.length).toBeGreaterThanOrEqual(6);
    const found = files.flatMap(({ path, text }) =>
      findHardcodedText(text).map((label) => `${path}: ${label}`),
    );
    expect(found).toEqual([]);
  });
});

/** The labels of fr.json that no source file asks for by name. */
function unusedLabels(labels: readonly string[], texts: readonly string[]): string[] {
  return labels.filter((label) => !texts.some((text) => text.includes(`'${label}'`)));
}

describe('the labels of locales/fr.json', () => {
  it('finds the label that nobody uses (negative control)', () => {
    expect(unusedLabels(['a.used', 'a.dead'], ["t('a.used')"])).toEqual(['a.dead']);
    expect(unusedLabels(['a.used'], ["t('a.used')"])).toEqual([]);
  });

  it('are all used: none is left behind when a screen changes', () => {
    const texts = sources(/\.tsx?$/).map(({ text }) => text);
    expect(unusedLabels(Object.keys(fr), texts)).toEqual([]);
  });

  it('are all written in French form: not empty, not a key, without a stray space at either end', () => {
    for (const [key, text] of Object.entries(fr)) {
      expect(text, key).not.toBe('');
      expect(text, key).not.toBe(key);
    }
    for (const [key, text] of Object.entries(fr)) {
      if (key !== 'catalog.copySuffix') expect(text, key).toBe(text.trim());
    }
  });
});
