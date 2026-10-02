/**
 * Base design tokens (EF-THM-01): colours, typography, spacing, radii, shadows, density, states.
 * Names are dotted (`color.surface`); each one is exposed as a CSS custom property `--acs-*`.
 */

/** Tokens identical in every mode. */
export const baseTokens = {
  'font.family.sans': "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'font.family.mono': "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
  'font.size.sm': '0.875rem',
  'font.size.md': '1rem',
  'font.size.lg': '1.25rem',
  'font.size.xl': '1.5rem',
  'font.weight.regular': '400',
  'font.weight.bold': '600',
  'line-height.normal': '1.5',
  'space.1': '0.25rem',
  'space.2': '0.5rem',
  'space.3': '0.75rem',
  'space.4': '1rem',
  'space.5': '1.5rem',
  'space.6': '2rem',
  'radius.sm': '0.25rem',
  'radius.md': '0.5rem',
  'radius.lg': '1rem',
  'density.control-height': '2.5rem',
  'density.gap': '0.75rem',
  'state.disabled-opacity': '0.5',
  'state.focus-ring-width': '2px',
} as const;

/** Tokens whose value depends on the mode: light is the reference, dark must define the same set. */
export const lightTokens = {
  'color.surface': '#ffffff',
  'color.surface-alt': '#f4f5f7',
  'color.text': '#1a1d23',
  'color.text-muted': '#4a5160',
  'color.border': '#8a93a3',
  'color.primary': '#1d4ed8',
  'color.on-primary': '#ffffff',
  'color.danger': '#b42318',
  'color.on-danger': '#ffffff',
  'color.success': '#067647',
  'color.on-success': '#ffffff',
  'color.warning': '#92400e',
  'color.on-warning': '#ffffff',
  'color.focus': '#1d4ed8',
  'shadow.sm': '0 1px 2px rgb(0 0 0 / 0.12)',
  'shadow.md': '0 4px 12px rgb(0 0 0 / 0.16)',
  'state.hover-overlay': 'rgb(0 0 0 / 0.06)',
} as const;

export type BaseTokenName = keyof typeof baseTokens;
export type ModeTokenName = keyof typeof lightTokens;
export type TokenName = BaseTokenName | ModeTokenName;

/** Typed as a complete record: forgetting a dark value is a compile error. */
export const darkTokens: Readonly<Record<ModeTokenName, string>> = {
  'color.surface': '#12151b',
  'color.surface-alt': '#1b1f27',
  'color.text': '#e8eaee',
  'color.text-muted': '#aab1bf',
  'color.border': '#6b7385',
  'color.primary': '#7aa2ff',
  'color.on-primary': '#0b1220',
  'color.danger': '#ff8a80',
  'color.on-danger': '#2a0a07',
  'color.success': '#5fd49a',
  'color.on-success': '#04210f',
  'color.warning': '#f5b45f',
  'color.on-warning': '#2b1700',
  'color.focus': '#7aa2ff',
  'shadow.sm': '0 1px 2px rgb(0 0 0 / 0.5)',
  'shadow.md': '0 4px 12px rgb(0 0 0 / 0.6)',
  'state.hover-overlay': 'rgb(255 255 255 / 0.08)',
};
