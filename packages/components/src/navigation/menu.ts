import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { NAV_HREF_PATTERN, navLink } from '../base/links.js';
import { baseStyles } from '../base/styles.js';

export const navItemSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 100 }),
    href: Type.String({ pattern: NAV_HREF_PATTERN, maxLength: 2000 }),
  },
  { additionalProperties: false },
);

const propsSchema = Type.Object(
  {
    /** The accessible name of the navigation. */
    label: Type.String({ minLength: 1, maxLength: 200 }),
    items: Type.Array(navItemSchema, {
      minItems: 1,
      maxItems: 30,
      default: [{ label: 'Accueil', href: '#/' }],
    }),
    /** The `href` of the item the user is on. */
    current: Type.Optional(Type.String({ maxLength: 2000 })),
    orientation: Type.Union([Type.Literal('vertical'), Type.Literal('horizontal')], {
      default: 'vertical',
    }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A list of links to the pages of the application, vertical or horizontal. */
export class AcsNavigationMenu extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      ul {
        display: flex;
        flex-direction: column;
        gap: var(--acs-space-1);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      :host([orientation='horizontal']) ul {
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--acs-space-4);
      }
      a {
        display: inline-block;
        padding: var(--acs-space-2) var(--acs-space-3);
        border-radius: var(--acs-radius-sm);
        color: var(--acs-color-primary);
      }
      a[aria-current='page'] {
        background: var(--acs-color-surface-alt);
        color: var(--acs-color-text);
        font-weight: var(--acs-font-weight-bold);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.reflect({ orientation: this.props?.orientation ?? 'vertical' });
  }

  protected override render() {
    const { items = [], current, label = '' } = this.props ?? {};
    return html`<nav aria-label=${label}>
      <ul>
        ${items.map((item) => html`<li>${navLink(item, current)}</li>`)}
      </ul>
    </nav>`;
  }
}

export const navigationMenu: BaseComponent = {
  element: AcsNavigationMenu,
  definition: {
    id: 'navigation.menu',
    version: '1.0.0',
    category: 'navigation',
    tag: 'acs-navigation-menu',
    propsSchema,
    events: [],
    capabilities: [],
    accessibility: {
      role: 'navigation',
      nameFrom: 'prop:label',
      keyboard: ['Enter'],
      requiredProps: ['label'],
    },
    responsive: ['orientation'],
  } satisfies ComponentDefinition,
};
