import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, nothing } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { NAV_HREF_PATTERN, safeHref } from '../base/links.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 200, default: "Fil d'Ariane" }),
    /** The path to the current page; the last item has no `href`: it is the page itself. */
    items: Type.Array(
      Type.Object(
        {
          label: Type.String({ minLength: 1, maxLength: 100 }),
          href: Type.Optional(Type.String({ pattern: NAV_HREF_PATTERN, maxLength: 2000 })),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 12, default: [{ label: 'Accueil' }] },
    ),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** The path from the home page to the current page, as an ordered list of links. */
export class AcsNavigationBreadcrumb extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      ol {
        display: flex;
        flex-wrap: wrap;
        gap: var(--acs-space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li:not(:last-child)::after {
        content: '/';
        margin-inline-start: var(--acs-space-2);
        color: var(--acs-color-text-muted);
      }
      a {
        color: var(--acs-color-primary);
      }
      [aria-current='page'] {
        color: var(--acs-color-text);
        font-weight: var(--acs-font-weight-bold);
      }
    `,
  ];

  protected override render() {
    const { items = [], label = '' } = this.props ?? {};
    return html`<nav aria-label=${label}>
      <ol>
        ${items.map((item, index) => {
          const last = index === items.length - 1;
          return last || item.href === undefined
            ? html`<li><span aria-current=${last ? 'page' : nothing}>${item.label}</span></li>`
            : html`<li><a href=${safeHref(item.href) ?? nothing}>${item.label}</a></li>`;
        })}
      </ol>
    </nav>`;
  }
}

export const navigationBreadcrumb: BaseComponent = {
  element: AcsNavigationBreadcrumb,
  definition: {
    id: 'navigation.breadcrumb',
    version: '1.0.0',
    category: 'navigation',
    tag: 'acs-navigation-breadcrumb',
    propsSchema,
    events: [],
    capabilities: [],
    accessibility: {
      role: 'navigation',
      nameFrom: 'prop:label',
      keyboard: ['Enter'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
