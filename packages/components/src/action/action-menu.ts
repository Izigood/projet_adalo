import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    /** The text of the button that opens the menu. */
    label: Type.String({ minLength: 1, maxLength: 100 }),
    items: Type.Array(
      Type.Object(
        {
          key: Type.String({ pattern: '^[a-z][a-zA-Z0-9_]{0,63}$' }),
          label: Type.String({ minLength: 1, maxLength: 100 }),
          disabled: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 20, default: [{ key: 'action', label: 'Action' }] },
    ),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * A button that opens a list of actions (the menu button pattern of the ARIA Authoring Practices).
 * Down and Up open it and move through the items (Home and End jump), Escape closes it and gives
 * the focus back to the button, Tab and a click outside close it. Choosing an item says which one
 * (`acs-select` with its `key`); what it does is the business of the Runtime (lot 10).
 */
export class AcsActionActionMenu extends AcsElement<Props> {
  static override properties = {
    props: { attribute: false },
    isOpen: { state: true },
  };

  static override styles = [
    baseStyles,
    css`
      :host {
        position: relative;
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
      .menu {
        position: absolute;
        z-index: 10;
        inset-block-start: 100%;
        inset-inline-start: 0;
        min-width: 100%;
        margin: var(--acs-space-1) 0 0;
        padding: var(--acs-space-1);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface);
        box-shadow: var(--acs-shadow-md);
        list-style: none;
      }
      .menu[hidden] {
        display: none;
      }
      .item {
        display: block;
        width: 100%;
        border-color: transparent;
        text-align: start;
        white-space: nowrap;
      }
      .item:hover:not(:disabled),
      .item:focus-visible {
        background: var(--acs-color-surface-alt);
      }
      .item:disabled {
        opacity: var(--acs-state-disabled-opacity);
        cursor: not-allowed;
      }
    `,
  ];

  declare isOpen: boolean;

  readonly #closeOnOutsidePointer = (event: Event): void => {
    if (!event.composedPath().includes(this)) this.#close(false);
  };

  override disconnectedCallback(): void {
    this.ownerDocument.removeEventListener('pointerdown', this.#closeOnOutsidePointer);
    super.disconnectedCallback();
  }

  #items(): HTMLButtonElement[] {
    return [
      ...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
  }

  #trigger(): HTMLElement | null | undefined {
    return this.shadowRoot?.querySelector<HTMLElement>('#trigger');
  }

  #open(focus: 'first' | 'last' | 'none'): void {
    this.isOpen = true;
    this.ownerDocument.addEventListener('pointerdown', this.#closeOnOutsidePointer);
    if (focus === 'none') return;
    void this.updateComplete.then(() => {
      const items = this.#items();
      (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
    });
  }

  #close(refocus: boolean): void {
    this.isOpen = false;
    this.ownerDocument.removeEventListener('pointerdown', this.#closeOnOutsidePointer);
    if (refocus) this.#trigger()?.focus();
  }

  #onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    this.#open(event.key === 'ArrowDown' ? 'first' : 'last');
  }

  #onMenuKeydown(event: KeyboardEvent): void {
    const items = this.#items();
    const current = items.findIndex((item) => item === this.shadowRoot?.activeElement);
    const moves: Record<string, number> = {
      ArrowDown: (current + 1) % items.length,
      ArrowUp: (current - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#close(true);
    } else if (event.key === 'Tab') {
      this.#close(false);
    } else if (event.key in moves && items.length > 0) {
      event.preventDefault();
      items[moves[event.key] as number]?.focus();
    }
  }

  #select(key: string): void {
    this.emit('select', { key });
    this.#close(true);
  }

  protected override willUpdate(): void {
    this.isOpen ??= false;
  }

  protected override render() {
    const items = this.props?.items ?? [];
    return html`<button
        id="trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded=${this.isOpen ? 'true' : 'false'}
        aria-controls="menu"
        @click=${() => (this.isOpen ? this.#close(false) : this.#open('first'))}
        @keydown=${this.#onTriggerKeydown}
      >
        ${this.props?.label ?? ''} <span aria-hidden="true">▾</span>
      </button>
      <ul
        id="menu"
        class="menu"
        role="menu"
        aria-labelledby="trigger"
        ?hidden=${!this.isOpen}
        @keydown=${this.#onMenuKeydown}
      >
        ${items.map(
          (item) =>
            html`<li role="none">
              <button
                class="item"
                role="menuitem"
                type="button"
                tabindex="-1"
                ?disabled=${item.disabled === true}
                @click=${() => this.#select(item.key)}
              >
                ${item.label}
              </button>
            </li>`,
        )}
      </ul>`;
  }
}

export const actionActionMenu: BaseComponent = {
  element: AcsActionActionMenu,
  definition: {
    id: 'action.actionMenu',
    version: '1.0.0',
    category: 'action',
    tag: 'acs-action-action-menu',
    propsSchema,
    events: [
      {
        name: 'select',
        description: 'The user chose an action of the menu.',
        payload: Type.Object({ key: Type.String() }),
      },
    ],
    capabilities: [],
    accessibility: {
      role: 'button',
      nameFrom: 'prop:label',
      keyboard: ['Enter', 'Space', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
