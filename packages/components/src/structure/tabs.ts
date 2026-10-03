import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import type { PropertyValues } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    /** The accessible name of the list of tabs. */
    label: Type.String({ minLength: 1, maxLength: 200 }),
    /** The title of each tab; the child at the same position is its panel. */
    tabs: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      minItems: 1,
      maxItems: 12,
      default: ['Onglet'],
    }),
    selected: Type.Integer({ minimum: 0, default: 0 }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * Tabs: one panel at a time. The children are the panels, in the order of `tabs`; the others are
 * hidden. Arrow keys, Home and End move between tabs (the tab that has focus is the selected one).
 */
export class AcsStructureTabs extends AcsElement<Props> {
  static override properties = {
    props: { attribute: false },
    selectedIndex: { state: true },
  };

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--acs-space-1);
        border-bottom: 1px solid var(--acs-color-border);
      }
      .tab {
        min-height: var(--acs-density-control-height);
        padding: 0 var(--acs-space-4);
        border: 1px solid transparent;
        border-bottom: 0;
        border-radius: var(--acs-radius-sm) var(--acs-radius-sm) 0 0;
        background: transparent;
        color: var(--acs-color-text-muted);
        font: inherit;
        cursor: pointer;
      }
      .tab[aria-selected='true'] {
        border-color: var(--acs-color-border);
        background: var(--acs-color-surface);
        color: var(--acs-color-text);
        font-weight: var(--acs-font-weight-bold);
      }
      .panels {
        padding-top: var(--acs-space-4);
      }
    `,
  ];

  declare selectedIndex: number;

  /** The tab the manifest asked for the last time: only a change of it moves the selection. */
  #requested: number | undefined;

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('props')) return;
    const last = (this.props?.tabs.length ?? 1) - 1;
    const requested = this.props?.selected ?? 0;
    // The Runtime gives a new `props` object at every render (a breakpoint change, a navigation
    // back to the page), with the same values: the tab the user chose must survive that. The
    // selection only goes back to what the manifest says when the manifest says something else.
    const wanted = requested === this.#requested ? this.selectedIndex : requested;
    this.#requested = requested;
    this.selectedIndex = Math.min(Math.max(wanted ?? requested, 0), last);
  }

  protected override updated(): void {
    this.#assignSlots();
  }

  #select(index: number, focus = false): void {
    if (index !== this.selectedIndex) {
      this.selectedIndex = index;
      this.emit('change', { index });
    }
    if (focus) {
      void this.updateComplete.then(() =>
        this.shadowRoot?.querySelector<HTMLElement>(`#tab-${index}`)?.focus(),
      );
    }
  }

  #onKeydown(event: KeyboardEvent): void {
    const count = this.props?.tabs.length ?? 0;
    const keys: Record<string, number> = {
      ArrowRight: (this.selectedIndex + 1) % count,
      ArrowLeft: (this.selectedIndex - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const target = keys[event.key];
    if (target === undefined || count === 0) return;
    event.preventDefault();
    this.#select(target, true);
  }

  /**
   * Each child goes in the slot of the panel at its position. The panel itself (role, name, focus,
   * visibility) belongs to this component's shadow DOM, so a child keeps its own role and
   * attributes: a stack or a grid used as a panel is not turned into something else, and does not
   * take the role back from the panel on its next update.
   */
  #assignSlots(): void {
    [...this.children].forEach((content, index) => content.setAttribute('slot', `panel-${index}`));
  }

  protected override render() {
    const tabs = this.props?.tabs ?? [];
    return html`
      <div
        class="list"
        role="tablist"
        aria-label=${this.props?.label ?? ''}
        @keydown=${this.#onKeydown}
      >
        ${tabs.map(
          (title, index) =>
            html`<button
              class="tab"
              role="tab"
              id=${`tab-${index}`}
              aria-selected=${index === this.selectedIndex ? 'true' : 'false'}
              aria-controls=${`panel-${index}`}
              tabindex=${index === this.selectedIndex ? '0' : '-1'}
              @click=${() => this.#select(index)}
            >
              ${title}
            </button>`,
        )}
      </div>
      <div class="panels">
        ${tabs.map(
          (_title, index) =>
            html`<div
              class="panel"
              role="tabpanel"
              id=${`panel-${index}`}
              aria-labelledby=${`tab-${index}`}
              tabindex="0"
              ?hidden=${index !== this.selectedIndex}
            >
              <slot name=${`panel-${index}`}></slot>
            </div>`,
        )}
        <!-- Children that have no slot yet (added later) land here, then are assigned one. -->
        <slot hidden @slotchange=${() => this.#assignSlots()}></slot>
      </div>
    `;
  }
}

export const structureTabs: BaseComponent = {
  element: AcsStructureTabs,
  definition: {
    id: 'structure.tabs',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-tabs',
    propsSchema,
    events: [
      {
        name: 'change',
        description: 'The user selected another tab.',
        payload: Type.Object({ index: Type.Integer() }),
      },
    ],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: {
      role: 'tablist',
      nameFrom: 'prop:label',
      keyboard: ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
