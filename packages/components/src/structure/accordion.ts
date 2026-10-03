import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    /** The accessible name of the group of sections. */
    label: Type.String({ minLength: 1, maxLength: 200 }),
    /** The title of each section; the child at the same position is its content. */
    items: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      minItems: 1,
      maxItems: 30,
      default: ['Section'],
    }),
    /** Positions of the sections that start open. */
    open: Type.Array(Type.Integer({ minimum: 0 }), { default: [] }),
    /** May several sections be open at once? */
    multiple: Type.Boolean({ default: false }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * Up to this many sections each panel is a named region; beyond it they are not, because a page full
 * of landmarks is harder to navigate than one without (ARIA Authoring Practices).
 */
const MAX_REGIONS = 6;

/**
 * Sections that open and close. The children are the contents, in the order of `items`; each one
 * is put in its own slot so that it appears under its title.
 */
export class AcsStructureAccordion extends AcsElement<Props> {
  static override properties = {
    props: { attribute: false },
    openIndexes: { state: true },
  };

  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
      }
      .title {
        margin: 0;
      }
      .header {
        display: flex;
        width: 100%;
        min-height: var(--acs-density-control-height);
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--acs-space-4);
        border: 0;
        border-top: 1px solid var(--acs-color-border);
        background: var(--acs-color-surface-alt);
        color: var(--acs-color-text);
        font: inherit;
        font-weight: var(--acs-font-weight-bold);
        text-align: start;
        cursor: pointer;
      }
      .item:first-child .header {
        border-top: 0;
      }
      .panel {
        padding: var(--acs-space-4);
      }
    `,
  ];

  declare openIndexes: readonly number[];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('props')) {
      const count = this.props?.items.length ?? 0;
      const open = (this.props?.open ?? []).filter((index) => index < count);
      this.openIndexes = this.props?.multiple === true ? open : open.slice(0, 1);
    }
  }

  protected override updated(): void {
    this.#assignSlots();
  }

  #toggle(index: number): void {
    const isOpen = this.openIndexes.includes(index);
    if (isOpen) this.openIndexes = this.openIndexes.filter((open) => open !== index);
    else this.openIndexes = this.props?.multiple === true ? [...this.openIndexes, index] : [index];
    this.emit('toggle', { index, open: !isOpen });
  }

  /** Each child goes in the slot of the section at its position. */
  #assignSlots(): void {
    [...this.children].forEach((content, index) => content.setAttribute('slot', `panel-${index}`));
  }

  protected override render() {
    const items = this.props?.items ?? [];
    return html`<div role="group" aria-label=${this.props?.label ?? ''}>
      ${items.map((title, index) => {
        const isOpen = this.openIndexes.includes(index);
        return html`<div class="item">
          <h3 class="title">
            <button
              class="header"
              id=${`header-${index}`}
              aria-expanded=${isOpen ? 'true' : 'false'}
              aria-controls=${`panel-${index}`}
              @click=${() => this.#toggle(index)}
            >
              ${title}
            </button>
          </h3>
          <div
            class="panel"
            id=${`panel-${index}`}
            role=${items.length <= MAX_REGIONS ? 'region' : nothing}
            aria-labelledby=${items.length <= MAX_REGIONS ? `header-${index}` : nothing}
            ?hidden=${!isOpen}
          >
            <slot name=${`panel-${index}`}></slot>
          </div>
        </div>`;
      })}
      <!-- Children that have no slot yet (added later) land here, then are assigned one. -->
      <slot hidden @slotchange=${() => this.#assignSlots()}></slot>
    </div>`;
  }
}

export const structureAccordion: BaseComponent = {
  element: AcsStructureAccordion,
  definition: {
    id: 'structure.accordion',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-accordion',
    propsSchema,
    events: [
      {
        name: 'toggle',
        description: 'The user opened or closed a section.',
        payload: Type.Object({ index: Type.Integer(), open: Type.Boolean() }),
      },
    ],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: {
      role: 'group',
      nameFrom: 'prop:label',
      keyboard: ['Enter', 'Space'],
      requiredProps: ['label'],
    },
  } satisfies ComponentDefinition,
};
