import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 50 }),
    tone: Type.Union(
      [
        Type.Literal('neutral'),
        Type.Literal('info'),
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

/**
 * A short label with a colour. The colour is never the only carrier of the meaning: the text says
 * it, and each tone pairs a background with the text colour made for it (contrast of the tokens).
 */
export class AcsInfoBadge extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: inline-block;
      }
      span {
        display: inline-block;
        padding: 0 var(--acs-space-2);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-lg);
        background: var(--acs-color-surface-alt);
        color: var(--acs-color-text);
        font-size: var(--acs-font-size-sm);
        font-weight: var(--acs-font-weight-bold);
      }
      :host([tone='info']) span {
        border-color: transparent;
        background: var(--acs-color-primary);
        color: var(--acs-color-on-primary);
      }
      :host([tone='success']) span {
        border-color: transparent;
        background: var(--acs-color-success);
        color: var(--acs-color-on-success);
      }
      :host([tone='warning']) span {
        border-color: transparent;
        background: var(--acs-color-warning);
        color: var(--acs-color-on-warning);
      }
      :host([tone='danger']) span {
        border-color: transparent;
        background: var(--acs-color-danger);
        color: var(--acs-color-on-danger);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.setAttribute('role', 'none');
    this.reflect({ tone: this.props?.tone ?? 'neutral' });
  }

  protected override render() {
    return html`<span>${this.props?.text ?? ''}</span>`;
  }
}

export const infoBadge: BaseComponent = {
  element: AcsInfoBadge,
  definition: {
    id: 'info.badge',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-badge',
    propsSchema,
    events: [],
    bindings: [{ prop: 'text', kind: 'value' }],
    capabilities: [],
    accessibility: { role: 'none', nameFrom: 'content', keyboard: [], requiredProps: [] },
  } satisfies ComponentDefinition,
};
