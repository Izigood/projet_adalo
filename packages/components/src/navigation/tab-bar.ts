import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { navLink } from '../base/links.js';
import { baseStyles } from '../base/styles.js';
import { navItemSchema } from './menu.js';

const propsSchema = Type.Object(
  {
    /** The accessible name of the bar. */
    label: Type.String({ minLength: 1, maxLength: 200 }),
    items: Type.Array(navItemSchema, {
      minItems: 1,
      maxItems: 6,
      default: [{ label: 'Accueil', href: '#/' }],
    }),
    /** The `href` of the item the user is on. */
    current: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A bar of at most six links, side by side with equal width: the main sections of an app. */
export class AcsNavigationTabBar extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        border-bottom: 1px solid var(--acs-color-border);
      }
      ul {
        display: flex;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li {
        flex: 1 1 0;
        min-width: 0;
      }
      a {
        display: block;
        min-height: var(--acs-density-control-height);
        padding: var(--acs-space-2) var(--acs-space-3);
        color: var(--acs-color-text-muted);
        text-align: center;
        overflow-wrap: anywhere;
      }
      a[aria-current='page'] {
        border-bottom: 3px solid var(--acs-color-primary);
        color: var(--acs-color-text);
        font-weight: var(--acs-font-weight-bold);
      }
    `,
  ];

  protected override render() {
    const { items = [], current, label = '' } = this.props ?? {};
    return html`<nav aria-label=${label}>
      <ul>
        ${items.map((item) => html`<li>${navLink(item, current)}</li>`)}
      </ul>
    </nav>`;
  }
}

export const navigationTabBar: BaseComponent = {
  element: AcsNavigationTabBar,
  definition: {
    id: 'navigation.tabBar',
    version: '1.0.0',
    category: 'navigation',
    tag: 'acs-navigation-tab-bar',
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
