import { baseTokens, darkTokens, lightTokens } from './tokens.js';

/** `color.surface-alt` -> `--acs-color-surface-alt` */
export function cssVarName(token: string): string {
  return `--acs-${token.replaceAll('.', '-')}`;
}

function declarations(tokens: Readonly<Record<string, string>>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${cssVarName(name)}: ${value};`)
    .join('\n');
}

/**
 * Stylesheet exposing every token as a CSS custom property. Light is the default; dark applies
 * through `data-theme="dark"` or the system preference unless `data-theme="light"` is forced.
 * Use applyTheme() to inject it; never build markup from it with innerHTML.
 */
export function themeCss(): string {
  const dark = declarations(darkTokens);
  const indented = dark
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return [
    ':root {',
    declarations(baseTokens),
    declarations(lightTokens),
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
