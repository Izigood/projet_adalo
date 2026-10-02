import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html, unsafeCSS } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { GAPS, baseStyles } from '../base/styles.js';

export const MAX_COLUMNS = 12;

const propsSchema = Type.Object(
  {
    columns: Type.Integer({ minimum: 1, maximum: MAX_COLUMNS, default: 1 }),
    gap: Type.Union([Type.Literal('sm'), Type.Literal('md'), Type.Literal('lg')], {
      default: 'md',
    }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/**
 * One rule per column count: the count goes on the host as an attribute, because a custom
 * property set through a `style` attribute would be blocked by the CSP (dossier 8.1). The text is
 * built from constants only.
 */
const columnRules = unsafeCSS(
  Array.from(
    { length: MAX_COLUMNS },
    (_, i) =>
      `:host([columns='${i + 1}']) { grid-template-columns: repeat(${i + 1}, minmax(0, 1fr)); }`,
  ).join('\n'),
);

/** A grid of equal columns, in flow (D-02). The number of columns is what breakpoints override. */
export class AcsStructureGrid extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: ${GAPS.md};
      }
      :host([gap='sm']) {
        gap: ${GAPS.sm};
      }
      :host([gap='lg']) {
        gap: ${GAPS.lg};
      }
      ${columnRules}
    `,
  ];

  protected override willUpdate(): void {
    this.setAttribute('role', 'none');
    this.reflect({
      columns: String(this.props?.columns ?? 1),
      gap: this.props?.gap ?? 'md',
    });
  }

  protected override render() {
    return html`<slot></slot>`;
  }
}

export const structureGrid: BaseComponent = {
  element: AcsStructureGrid,
  definition: {
    id: 'structure.grid',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-grid',
    propsSchema,
    events: [],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: { role: 'none', nameFrom: 'content', keyboard: [], requiredProps: [] },
    responsive: ['columns', 'gap'],
  } satisfies ComponentDefinition,
};
