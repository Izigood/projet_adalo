import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';
import { t } from '../i18n.js';

const propsSchema = Type.Object(
  {
    message: Type.String({ maxLength: 2000, default: '' }),
    tone: Type.Union(
      [
        Type.Literal('info'),
        Type.Literal('success'),
        Type.Literal('warning'),
        Type.Literal('danger'),
      ],
      { default: 'info' },
    ),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

const LEAD = {
  info: 'text.alert.info',
  success: 'text.alert.success',
  warning: 'text.alert.warning',
  danger: 'text.alert.danger',
} as const;

/**
 * A message the user must not miss. Each tone starts with a word that says what it is
 * (« Erreur : », « Attention : »…), so the meaning does not rest on colour alone (WCAG 1.4.1).
 */
export class AcsInfoAlert extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      div {
        padding: var(--acs-space-3) var(--acs-space-4);
        border: 1px solid var(--acs-color-border);
        border-inline-start: 6px solid var(--acs-color-primary);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface-alt);
        overflow-wrap: anywhere;
      }
      :host([tone='success']) div {
        border-inline-start-color: var(--acs-color-success);
      }
      :host([tone='warning']) div {
        border-inline-start-color: var(--acs-color-warning);
      }
      :host([tone='danger']) div {
        border-inline-start-color: var(--acs-color-danger);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.reflect({ tone: this.props?.tone ?? 'info' });
  }

  protected override render() {
    const tone = this.props?.tone ?? 'info';
    return html`<div role="alert">
      <strong>${t(LEAD[tone])}</strong> ${this.props?.message ?? ''}
    </div>`;
  }
}

export const infoAlert: BaseComponent = {
  element: AcsInfoAlert,
  definition: {
    id: 'info.alert',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-alert',
    propsSchema,
    events: [],
    bindings: [{ prop: 'message', kind: 'value' }],
    capabilities: [],
    accessibility: { role: 'alert', nameFrom: 'content', keyboard: [], requiredProps: [] },
  } satisfies ComponentDefinition,
};
