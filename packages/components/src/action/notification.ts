import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';
import { toneLead } from '../base/tones.js';
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
    dismissible: Type.Boolean({ default: true }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * A message that appears without taking focus: a polite live region, which assistive technologies
 * announce when it changes. It stays until the user closes it (`acs-dismiss`); it never goes away
 * on a timer, so nobody is left without time to read it.
 */
export class AcsActionNotification extends AcsElement<Props> {
  static override properties = {
    props: { attribute: false },
    dismissed: { state: true },
  };

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .box {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--acs-space-3);
        padding: var(--acs-space-3) var(--acs-space-4);
        border: 1px solid var(--acs-color-border);
        border-inline-start: 6px solid var(--acs-color-primary);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface);
        box-shadow: var(--acs-shadow-md);
      }
      .text {
        overflow-wrap: anywhere;
      }
      :host([tone='success']) .box {
        border-inline-start-color: var(--acs-color-success);
      }
      :host([tone='warning']) .box {
        border-inline-start-color: var(--acs-color-warning);
      }
      :host([tone='danger']) .box {
        border-inline-start-color: var(--acs-color-danger);
      }
      .close {
        flex: none;
        min-width: var(--acs-density-control-height);
        min-height: var(--acs-density-control-height);
        border: 0;
        background: transparent;
        color: var(--acs-color-text);
        font: inherit;
        font-size: var(--acs-font-size-lg);
        cursor: pointer;
      }
    `,
  ];

  declare dismissed: boolean;

  protected override willUpdate(changed: PropertyValues<this>): void {
    // A new message is shown even if the previous one was closed.
    if (changed.has('props')) this.dismissed = false;
    this.reflect({ tone: this.props?.tone ?? 'info' });
  }

  #dismiss(): void {
    this.dismissed = true;
    this.emit('dismiss');
  }

  protected override render() {
    if (this.dismissed) return nothing;
    const tone = this.props?.tone ?? 'info';
    return html`<div class="box" role="status">
      <span class="text"><strong>${toneLead(tone)}</strong> ${this.props?.message ?? ''}</span>
      ${
        this.props?.dismissible === false
          ? nothing
          : html`<button
              class="close"
              type="button"
              aria-label=${t('text.notification.dismiss')}
              @click=${() => this.#dismiss()}
            >
              ×
            </button>`
      }
    </div>`;
  }
}

export const actionNotification: BaseComponent = {
  element: AcsActionNotification,
  definition: {
    id: 'action.notification',
    version: '1.0.0',
    category: 'action',
    tag: 'acs-action-notification',
    propsSchema,
    events: [{ name: 'dismiss', description: 'The user closed the notification.' }],
    bindings: [{ prop: 'message', kind: 'value' }],
    capabilities: [],
    accessibility: {
      role: 'status',
      nameFrom: 'content',
      keyboard: ['Enter', 'Space'],
      requiredProps: [],
    },
  } satisfies ComponentDefinition,
};
