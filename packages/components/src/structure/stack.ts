import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { GAPS, baseStyles } from '../base/styles.js';

const gap = Type.Union([Type.Literal('sm'), Type.Literal('md'), Type.Literal('lg')], {
  default: 'md',
});
const propsSchema = Type.Object(
  {
    direction: Type.Union([Type.Literal('vertical'), Type.Literal('horizontal')], {
      default: 'vertical',
    }),
    gap,
    align: Type.Union(
      [Type.Literal('start'), Type.Literal('center'), Type.Literal('end'), Type.Literal('stretch')],
      { default: 'stretch' },
    ),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** Lays its children out in a line, in flow (D-02): vertical or horizontal, wrapping. */
export class AcsStructureStack extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: ${GAPS.md};
        align-items: stretch;
      }
      :host([direction='horizontal']) {
        flex-direction: row;
        flex-wrap: wrap;
      }
      :host([gap='sm']) {
        gap: ${GAPS.sm};
      }
      :host([gap='lg']) {
        gap: ${GAPS.lg};
      }
      :host([align='start']) {
        align-items: flex-start;
      }
      :host([align='center']) {
        align-items: center;
      }
      :host([align='end']) {
        align-items: flex-end;
      }
    `,
  ];

  protected override willUpdate(): void {
    this.setAttribute('role', 'none');
    this.reflect({
      direction: this.props?.direction ?? 'vertical',
      gap: this.props?.gap ?? 'md',
      align: this.props?.align ?? 'stretch',
    });
  }

  protected override render() {
    return html`<slot></slot>`;
  }
}

export const structureStack: BaseComponent = {
  element: AcsStructureStack,
  definition: {
    id: 'structure.stack',
    version: '1.0.0',
    category: 'structure',
    tag: 'acs-structure-stack',
    propsSchema,
    events: [],
    slots: [{ name: 'default' }],
    capabilities: [],
    accessibility: { role: 'none', nameFrom: 'content', keyboard: [], requiredProps: [] },
    responsive: ['direction', 'gap', 'align'],
  } satisfies ComponentDefinition,
};
