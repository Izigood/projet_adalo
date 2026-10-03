import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 300 }),
    level: Type.Integer({ minimum: 1, maximum: 4, default: 1 }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A heading, level 1 by default: the title of a page. */
export class AcsInfoTitle extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      h1,
      h2,
      h3,
      h4 {
        margin: 0 0 var(--acs-space-2);
        font-weight: var(--acs-font-weight-bold);
        overflow-wrap: anywhere;
      }
      h1 {
        font-size: var(--acs-font-size-xl);
      }
      h2 {
        font-size: var(--acs-font-size-lg);
      }
      h3,
      h4 {
        font-size: var(--acs-font-size-md);
      }
    `,
  ];

  protected override render() {
    const text = this.props?.text ?? '';
    switch (this.props?.level) {
      case 2:
        return html`<h2>${text}</h2>`;
      case 3:
        return html`<h3>${text}</h3>`;
      case 4:
        return html`<h4>${text}</h4>`;
      default:
        return html`<h1>${text}</h1>`;
    }
  }
}

export const infoTitle: BaseComponent = {
  element: AcsInfoTitle,
  definition: {
    id: 'info.title',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-title',
    propsSchema,
    events: [],
    bindings: [{ prop: 'text', kind: 'value' }],
    capabilities: [],
    accessibility: {
      role: 'heading',
      nameFrom: 'prop:text',
      keyboard: [],
      requiredProps: ['text'],
    },
  } satisfies ComponentDefinition,
};
