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
    label: Type.String({ minLength: 1, maxLength: 200 }),
    href: Type.String({ pattern: NAV_HREF_PATTERN, maxLength: 2000, default: '#/' }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A link to a route of the application, a web page or a mail address. */
export class AcsNavigationLink extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: inline-block;
      }
      a {
        color: var(--acs-color-primary);
      }
    `,
  ];

  protected override render() {
    const href = safeHref(this.props?.href);
    const external = href !== undefined && !href.startsWith('#');
    return html`<a href=${href ?? nothing} rel=${external ? 'noopener noreferrer' : nothing}
      >${this.props?.label ?? ''}</a
    >`;
  }
}

export const navigationLink: BaseComponent = {
  element: AcsNavigationLink,
  definition: {
    id: 'navigation.link',
    version: '1.0.0',
    category: 'navigation',
    tag: 'acs-navigation-link',
    propsSchema,
    events: [],
    capabilities: [],
    accessibility: {
      role: 'link',
      nameFrom: 'prop:label',
      keyboard: ['Enter'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
