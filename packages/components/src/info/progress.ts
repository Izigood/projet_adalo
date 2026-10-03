import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, nothing } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 200 }),
    value: Type.Number({ minimum: 0, default: 0 }),
    max: Type.Number({ exclusiveMinimum: 0, default: 100 }),
    showValue: Type.Boolean({ default: true }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** How far along something is, as a bar and a percentage. A value above `max` shows as full. */
export class AcsInfoProgress extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--acs-space-3);
      }
      progress {
        flex: 1 1 auto;
        min-width: 0;
        height: var(--acs-space-3);
        border: 0;
        border-radius: var(--acs-radius-lg);
        appearance: none;
        background: var(--acs-color-surface-alt);
        overflow: hidden;
      }
      progress::-webkit-progress-bar {
        background: var(--acs-color-surface-alt);
      }
      progress::-webkit-progress-value {
        background: var(--acs-color-primary);
      }
      progress::-moz-progress-bar {
        background: var(--acs-color-primary);
      }
      .percent {
        min-width: 3.5em;
        text-align: end;
        font-size: var(--acs-font-size-sm);
      }
    `,
  ];

  protected override render() {
    const max = this.props?.max !== undefined && this.props.max > 0 ? this.props.max : 100;
    const value = Math.min(Math.max(this.props?.value ?? 0, 0), max);
    // A no-break space keeps the number and the sign together. It is built from its code, not typed:
    // the raw character is refused by the lint rule on irregular whitespace, and Prettier turns an
    // escape written inside an html template into the raw character.
    const percent = `${Math.round((value / max) * 100)}${String.fromCharCode(0xa0)}%`;
    return html`<div class="row">
      <progress aria-label=${this.props?.label ?? ''} value=${value} max=${max}></progress>
      ${this.props?.showValue === false ? nothing : html`<span class="percent">${percent}</span>`}
    </div>`;
  }
}

export const infoProgress: BaseComponent = {
  element: AcsInfoProgress,
  definition: {
    id: 'info.progress',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-progress',
    propsSchema,
    events: [],
    bindings: [{ prop: 'value', kind: 'value' }],
    capabilities: [],
    accessibility: {
      role: 'progressbar',
      nameFrom: 'prop:label',
      keyboard: [],
      requiredProps: ['label'],
    },
    responsive: ['showValue'],
  } satisfies ComponentDefinition,
};
