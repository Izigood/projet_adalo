import { css, unsafeCSS } from 'lit';

/** Shared by every component: the box model and the tokens of the design system. */
export const baseStyles = css`
  :host {
    box-sizing: border-box;
    color: var(--acs-color-text);
    font-family: var(--acs-font-family-sans);
    line-height: var(--acs-line-height-normal);
  }
  :host([hidden]) {
    display: none;
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
  :focus-visible {
    outline: var(--acs-state-focus-ring-width) solid var(--acs-color-focus);
    outline-offset: 2px;
  }
`;

/** The gap sizes a component may use, as design tokens (constants, never user data). */
export const GAPS = {
  sm: unsafeCSS('var(--acs-space-2)'),
  md: unsafeCSS('var(--acs-space-4)'),
  lg: unsafeCSS('var(--acs-space-6)'),
};
