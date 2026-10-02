import { html, nothing } from 'lit';
import type { TemplateResult } from 'lit';

/**
 * Where a link may lead: a route of the application (`#/orders`), a web page or a mail address.
 * Anything else (`javascript:`, `data:`, a bare path) is not a destination the manifest can name.
 */
export const NAV_HREF_PATTERN = '^(#/[^\\s]*|https?://[^\\s]+|mailto:[^\\s]+)$';

const ALLOWED = new RegExp(NAV_HREF_PATTERN);

/**
 * The `href` to put on an anchor, or `undefined` for one that is not an allowed destination: the
 * anchor is then inert. Props are validated before they reach a component, but a link is the one
 * place where a bad value is dangerous (`javascript:`), so it is checked again here.
 */
export function safeHref(href: string | undefined): string | undefined {
  return href !== undefined && ALLOWED.test(href) ? href : undefined;
}

export type NavItem = { readonly label: string; readonly href: string };

/** An anchor for a navigation list: `aria-current="page"` marks the item the user is on. */
export function navLink(item: NavItem, current: string | undefined): TemplateResult {
  return html`<a
    href=${safeHref(item.href) ?? nothing}
    aria-current=${item.href === current ? 'page' : nothing}
    >${item.label}</a
  >`;
}
