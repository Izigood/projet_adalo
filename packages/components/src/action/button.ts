import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 100 }),
    variant: Type.Union(
      [Type.Literal('primary'), Type.Literal('secondary'), Type.Literal('danger')],
      {
        default: 'primary',
      },
    ),
    disabled: Type.Boolean({ default: false }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * A button. It only says that it was pressed (`acs-press`): what that does is decided by the
 * Runtime, which turns the event into a command (lot 10). A disabled button says nothing.
 */
export class AcsActionButton extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: inline-block;
      }
      button {
        min-height: var(--acs-density-control-height);
        padding: 0 var(--acs-space-4);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface);
        color: var(--acs-color-text);
        font: inherit;
        font-weight: var(--acs-font-weight-bold);
        cursor: pointer;
      }
      :host([variant='primary']) button {
        border-color: var(--acs-color-primary);
        background: var(--acs-color-primary);
        color: var(--acs-color-on-primary);
      }
      :host([variant='danger']) button {
        border-color: var(--acs-color-danger);
        background: var(--acs-color-danger);
        color: var(--acs-color-on-danger);
      }
      button:disabled {
        opacity: var(--acs-state-disabled-opacity);
        cursor: not-allowed;
      }
    `,
  ];

  protected override willUpdate(): void {
    this.reflect({ variant: this.props?.variant ?? 'primary' });
  }

  protected override render() {
    return html`<button
      type="button"
      ?disabled=${this.props?.disabled === true}
      @click=${() => this.emit('press')}
    >
      ${this.props?.label ?? ''}
    </button>`;
  }
}

export const actionButton: BaseComponent = {
  element: AcsActionButton,
  definition: {
    id: 'action.button',
    version: '1.0.0',
    category: 'action',
    tag: 'acs-action-button',
    propsSchema,
    events: [{ name: 'press', description: 'The user pressed the button.' }],
    bindings: [
      { prop: 'label', kind: 'value' },
      { prop: 'disabled', kind: 'value' },
    ],
    capabilities: [],
    accessibility: {
      role: 'button',
      nameFrom: 'prop:label',
      keyboard: ['Enter', 'Space'],
      requiredProps: ['label'],
    },
    responsive: ['variant'],
  } satisfies ComponentDefinition,
};
