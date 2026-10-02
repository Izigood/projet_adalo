import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200 }),
    position: Type.Union([Type.Literal('start'), Type.Literal('end')], { default: 'end' }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * A panel beside the main content. Inside a horizontal stack it goes before or after the other
 * children (`position`); it can shrink to the width of a phone, where it wraps below.
 */
export class AcsStructureSidePanel extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        flex: 1 1 16rem;
        min-width: 0;
        order: 1;
      }
      :host([position='start']) {
        order: -1;
      }
      aside {
        padding: var(--acs-space-4);
        border: 1px solid var(--acs-color-border);
        border-radius: var(--acs-radius-md);
        background: var(--acs-color-surface-alt);
      }
      .title {
        margin: 0 0 var(--acs-space-3);
        font-size: var(--acs-font-size-lg);
        font-weight: var(--acs-font-weight-bold);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.reflect({ position: this.props?.position ?? 'end' });
  }

  protected override render() {
    return html`<aside aria-labelledby="title">
      <h2 class="title" id="title">${this.props?.title ?? ''}</h2>
      <slot></slot>
    </aside>`;
  }
}

export const structureSidePanel: BaseComponent = {
  element: AcsStructureSidePanel,
  definition: {
    id: 'structure.sidePanel',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-side-panel',
    propsSchema,
    events: [],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: {
      role: 'complementary',
      nameFrom: 'prop:title',
      keyboard: [],
      requiredProps: ['title'],
    },
    responsive: ['position'],
  } satisfies ComponentDefinition,
};
