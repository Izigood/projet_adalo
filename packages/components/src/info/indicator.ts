import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, nothing } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 100 }),
    /** What to show: a text or a number (already formatted, once bindings exist). */
    value: Type.Union([Type.String({ maxLength: 100 }), Type.Number()]),
    hint: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    tone: Type.Union(
      [
        Type.Literal('neutral'),
        Type.Literal('success'),
        Type.Literal('warning'),
        Type.Literal('danger'),
      ],
      { default: 'neutral' },
    ),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A figure with its name (a key indicator): « Commandes ouvertes : 42 ». */
export class AcsInfoIndicator extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        height: 100%;
      }
      div {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--acs-space-1);
        padding: var(--acs-space-3) var(--acs-space-4);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
      }
      .label,
      .hint {
        color: var(--acs-color-text-muted);
        font-size: var(--acs-font-size-sm);
      }
      .value {
        font-size: var(--acs-font-size-xl);
        font-weight: var(--acs-font-weight-bold);
        overflow-wrap: anywhere;
      }
      :host([tone='success']) .value {
        color: var(--acs-color-success);
      }
      :host([tone='warning']) .value {
        color: var(--acs-color-warning);
      }
      :host([tone='danger']) .value {
        color: var(--acs-color-danger);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.reflect({ tone: this.props?.tone ?? 'neutral' });
  }

  protected override render() {
    const { label = '', value = '', hint } = this.props ?? {};
    return html`<div role="group" aria-label=${label}>
      <span class="label">${label}</span>
      <span class="value">${value}</span>
      ${hint === undefined ? nothing : html`<span class="hint">${hint}</span>`}
    </div>`;
  }
}

export const infoIndicator: BaseComponent = {
  element: AcsInfoIndicator,
  definition: {
    id: 'info.indicator',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-indicator',
    propsSchema,
    events: [],
    bindings: [{ prop: 'value', kind: 'value' }],
    capabilities: [],
    accessibility: {
      role: 'group',
      nameFrom: 'prop:label',
      keyboard: [],
      requiredProps: ['label', 'value'],
    },
  } satisfies ComponentDefinition,
};
