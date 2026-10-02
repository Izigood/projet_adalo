import { baseTokens, darkTokens, lightTokens } from './tokens.js';

type Tokens = Readonly<Record<string, string>>;

/**
 * Tokens a project theme adds to the design system (dossier 6.2, Theme): `tokens` hold the values
 * common to both modes, `modes` override them for `light` and `dark`.
 */
export type ThemeOverrides = {
  readonly tokens: Tokens;
  readonly modes: { readonly light: Tokens; readonly dark: Tokens };
};

/** `color.surface-alt` -> `--acs-color-surface-alt` */
export function cssVarName(token: string): string {
  return `--acs-${token.replaceAll('.', '-')}`;
}

// The manifest validator already refuses these (THEME_TOKEN_NAME_PATTERN, THEME_TOKEN_VALUE_PATTERN
// in project-schema). design-system cannot import it, so the characters that could close a
// declaration or a rule, or load a resource, are refused here too: a value that slipped past
// validation must never reach a stylesheet.
const SAFE_NAME = /^[a-z][a-zA-Z0-9-]*(\.[a-z0-9][a-zA-Z0-9-]*)*$/;
const UNSAFE_VALUE = /[;{}<>\\@!]|(?:url|image-set|expression)\s*\(/i;
const hasControlCharacter = (value: string) => [...value].some((char) => char.charCodeAt(0) < 0x20);

function assertSafe(tokens: Tokens): void {
  for (const [name, value] of Object.entries(tokens)) {
    if (!SAFE_NAME.test(name)) throw new Error(`unsafe design token name: ${name}`);
    if (
      value.length === 0 ||
      value.length > 200 ||
      UNSAFE_VALUE.test(value) ||
      hasControlCharacter(value)
    ) {
      throw new Error(`unsafe design token value for ${name}`);
    }
  }
}

function declarations(tokens: Tokens): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${cssVarName(name)}: ${value};`)
    .join('\n');
}

/**
 * Stylesheet exposing every token as a CSS custom property. Light is the default; dark applies
 * through `data-theme="dark"` or the system preference unless `data-theme="light"` is forced.
 * A project theme goes on top of the base tokens: a common token applies to both modes, and a mode
 * value wins over a common one. Use applyTheme() to inject it; never build markup from it with
 * innerHTML.
 */
export function themeCss(overrides?: ThemeOverrides): string {
  const common = overrides?.tokens ?? {};
  const modes = overrides?.modes ?? { light: {}, dark: {} };
  for (const tokens of [common, modes.light, modes.dark]) assertSafe(tokens);
  const light = { ...baseTokens, ...lightTokens, ...common, ...modes.light };
  const darkMap: Record<string, string> = { ...darkTokens, ...common, ...modes.dark };
  // The dark blocks only carry what depends on the mode; everything else stays in :root.
  const dark = declarations(
    Object.fromEntries(
      [...new Set([...Object.keys(darkTokens), ...Object.keys(modes.dark)])].map((name) => [
        name,
        darkMap[name] ?? '',
      ]),
    ),
  );
  const indented = dark
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return [
    ':root {',
    declarations(light),
    '  color-scheme: light;',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    indented,
    '    color-scheme: dark;',
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    dark,
    '  color-scheme: dark;',
    '}',
    '',
  ].join('\n');
}
