import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  { label: Type.String({ minLength: 1, maxLength: 100, default: 'Retour' }) },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * A button that asks to go back. It only says so (`acs-back`): what going back means is decided by
 * the Runtime, which turns the event into a command (lot 10).
 */
export class AcsNavigationBackButton extends AcsElement<Props> {
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
        cursor: pointer;
      }
      button:hover {
        background: var(--acs-color-surface-alt);
      }
    `,
  ];

  protected override render() {
    return html`<button type="button" @click=${() => this.emit('back')}>
      ${this.props?.label ?? ''}
    </button>`;
  }
}

export const navigationBackButton: BaseComponent = {
  element: AcsNavigationBackButton,
  definition: {
    id: 'navigation.backButton',
    version: '1.0.0',
    category: 'navigation',
    tag: 'acs-navigation-back-button',
    propsSchema,
    events: [{ name: 'back', description: 'The user asked to go back.' }],
    capabilities: [],
    accessibility: {
      role: 'button',
      nameFrom: 'prop:label',
      keyboard: ['Enter', 'Space'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
