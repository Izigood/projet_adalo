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
    /** The text of the button that asks the question. */
    label: Type.String({ minLength: 1, maxLength: 100 }),
    /** What the dialog asks: required, since a dialog without a question names nothing. */
    title: Type.String({ minLength: 1, maxLength: 200 }),
    message: Type.String({ maxLength: 1000, default: '' }),
    confirmLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
    cancelLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
    tone: Type.Union([Type.Literal('default'), Type.Literal('danger')], { default: 'default' }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * A button that, before anything happens, asks the user to confirm in a modal dialog (RG-14 for the
 * destructive ones). The native `<dialog>` brings the focus trap, the Escape key and the return of
 * the focus to the button. For a dangerous action the focus starts on « Annuler », so that a
 * hurried Enter does not confirm. It says `acs-confirm` or `acs-cancel`, nothing else.
 */
export class AcsActionConfirmation extends AcsElement<Props> {
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
      dialog {
        max-width: min(32rem, calc(100vw - 2 * var(--acs-space-4)));
        padding: var(--acs-space-5);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface);
        color: var(--acs-color-text);
        box-shadow: var(--acs-shadow-md);
      }
      dialog::backdrop {
        background: rgb(0 0 0 / 0.5);
      }
      .title {
        margin: 0 0 var(--acs-space-2);
        font-size: var(--acs-font-size-lg);
      }
      .message {
        margin: 0 0 var(--acs-space-4);
        overflow-wrap: anywhere;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--acs-space-3);
      }
      .confirm {
        border-color: var(--acs-color-primary);
        background: var(--acs-color-primary);
        color: var(--acs-color-on-primary);
        font-weight: var(--acs-font-weight-bold);
      }
      :host([tone='danger']) .confirm {
        border-color: var(--acs-color-danger);
        background: var(--acs-color-danger);
        color: var(--acs-color-on-danger);
      }
    `,
  ];

  #dialog(): HTMLDialogElement | null | undefined {
    return this.shadowRoot?.querySelector('dialog');
  }

  #ask(): void {
    const dialog = this.#dialog();
    if (dialog === null || dialog === undefined) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const first = this.props?.tone === 'danger' ? '.cancel' : '.confirm';
    this.shadowRoot?.querySelector<HTMLElement>(first)?.focus();
  }

  /**
   * Gives the focus back to the button that opened the dialog, whatever closed it. The native
   * `<dialog>` is meant to do it, but it restores the element that had the focus, and a button
   * pressed with the mouse does not take the focus in Safari: a mouse user would be left with the
   * focus on nothing (found by the E2E suite on WebKit).
   */
  #restoreFocus(): void {
    this.shadowRoot?.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')?.focus();
  }

  #answer(answer: 'confirm' | 'cancel'): void {
    const dialog = this.#dialog();
    if (typeof dialog?.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
    this.emit(answer);
  }

  protected override willUpdate(): void {
    this.reflect({ tone: this.props?.tone ?? 'default' });
  }

  protected override render() {
    return html`<button type="button" aria-haspopup="dialog" @click=${() => this.#ask()}>
        ${this.props?.label ?? ''}
      </button>
      <dialog
        aria-labelledby="title"
        aria-describedby="message"
        @cancel=${() => this.emit('cancel')}
        @close=${() => this.#restoreFocus()}
      >
        <h2 class="title" id="title">${this.props?.title ?? ''}</h2>
        <p class="message" id="message">${this.props?.message ?? ''}</p>
        <div class="actions">
          <button class="cancel" type="button" @click=${() => this.#answer('cancel')}>
            ${this.props?.cancelLabel ?? t('text.confirmation.cancel')}
          </button>
          <button class="confirm" type="button" @click=${() => this.#answer('confirm')}>
            ${this.props?.confirmLabel ?? t('text.confirmation.confirm')}
          </button>
        </div>
      </dialog>`;
  }
}

export const actionConfirmation: BaseComponent = {
  element: AcsActionConfirmation,
  definition: {
    id: 'action.confirmation',
    version: '1.0.0',
    category: 'action',
    tag: 'acs-action-confirmation',
    propsSchema,
    events: [
      { name: 'confirm', description: 'The user confirmed.' },
      { name: 'cancel', description: 'The user cancelled, or closed the dialog with Escape.' },
    ],
    capabilities: [],
    accessibility: {
      role: 'button',
      nameFrom: 'prop:label',
      keyboard: ['Enter', 'Space', 'Escape'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
