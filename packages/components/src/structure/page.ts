import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    width: Type.Union([Type.Literal('narrow'), Type.Literal('wide'), Type.Literal('full')], {
      default: 'wide',
    }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** The root container of a screen: centres its content and bounds its width. */
export class AcsStructurePage extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        margin-inline: auto;
        padding: var(--acs-space-4);
        max-width: 72rem;
      }
      :host([width='narrow']) {
        max-width: 40rem;
      }
      :host([width='full']) {
        max-width: none;
      }
    `,
  ];

  protected override willUpdate(): void {
    this.setAttribute('role', 'none');
    this.reflect({ width: this.props?.width ?? 'wide' });
  }

  protected override render() {
    return html`<slot></slot>`;
  }
}

export const structurePage: BaseComponent = {
  element: AcsStructurePage,
  definition: {
    id: 'structure.page',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-page',
    propsSchema,
    events: [],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: { role: 'none', nameFrom: 'content', keyboard: [], requiredProps: [] },
    responsive: ['width'],
  } satisfies ComponentDefinition,
};
