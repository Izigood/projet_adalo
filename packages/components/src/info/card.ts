import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    level: Type.Integer({ minimum: 2, maximum: 4, default: 3 }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A framed block of content, with an optional title that names it for assistive technologies. */
export class AcsInfoCard extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      article {
        padding: var(--acs-space-4);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface);
        box-shadow: var(--acs-shadow-sm);
      }
      .title {
        margin: 0 0 var(--acs-space-3);
        font-size: var(--acs-font-size-lg);
        font-weight: var(--acs-font-weight-bold);
        overflow-wrap: anywhere;
      }
    `,
  ];

  #heading(title: string): TemplateResult {
    switch (this.props?.level) {
      case 2:
        return html`<h2 class="title" id="title">${title}</h2>`;
      case 4:
        return html`<h4 class="title" id="title">${title}</h4>`;
      default:
        return html`<h3 class="title" id="title">${title}</h3>`;
    }
  }

  protected override render() {
    const title = this.props?.title;
    return html`<article aria-labelledby=${title === undefined ? nothing : 'title'}>
      ${title === undefined ? nothing : this.#heading(title)}<slot></slot>
    </article>`;
  }
}

export const infoCard: BaseComponent = {
  element: AcsInfoCard,
  definition: {
    id: 'info.card',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-card',
    propsSchema,
    events: [],
    slots: [{ name: 'default' }],
    bindings: [{ prop: 'title', kind: 'value' }],
    capabilities: [],
    accessibility: { role: 'article', nameFrom: 'content', keyboard: [], requiredProps: [] },
  } satisfies ComponentDefinition,
};
