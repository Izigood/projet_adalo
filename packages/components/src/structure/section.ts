import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200 }),
    level: Type.Integer({ minimum: 2, maximum: 4, default: 2 }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A titled region of a page. The heading names the region for assistive technologies. */
export class AcsStructureSection extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        margin-block: var(--acs-space-4);
      }
      .heading {
        margin: 0 0 var(--acs-space-3);
        font-size: var(--acs-font-size-lg);
        font-weight: var(--acs-font-weight-bold);
      }
    `,
  ];

  protected override render() {
    const title = this.props?.title ?? '';
    const heading =
      this.props?.level === 4
        ? html`<h4 class="heading" id="title">${title}</h4>`
        : this.props?.level === 3
          ? html`<h3 class="heading" id="title">${title}</h3>`
          : html`<h2 class="heading" id="title">${title}</h2>`;
    return html`<section aria-labelledby="title">${heading}<slot></slot></section>`;
  }
}

export const structureSection: BaseComponent = {
  element: AcsStructureSection,
  definition: {
    id: 'structure.section',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-section',
    propsSchema,
    events: [],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: {
      role: 'region',
      nameFrom: 'prop:title',
      keyboard: [],
      requiredProps: ['title'],
    },
  } satisfies ComponentDefinition,
};
