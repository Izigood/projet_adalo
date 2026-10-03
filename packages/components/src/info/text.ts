import type { ComponentDefinition } from '@acs/component-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { css, html } from 'lit';
import { AcsElement } from '../base/acs-element.js';
import type { BaseComponent } from '../base/define.js';
import { baseStyles } from '../base/styles.js';

const propsSchema = Type.Object(
  {
    text: Type.String({ maxLength: 10_000, default: '' }),
    tone: Type.Union([Type.Literal('default'), Type.Literal('muted')], { default: 'default' }),
  },
  { additionalProperties: false },
);
type Props = Static<typeof propsSchema>;

/** A paragraph of text. Newlines are kept (`white-space: pre-line`); markup is never interpreted. */
export class AcsInfoText extends AcsElement<Props> {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      p {
        margin: 0;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      :host([tone='muted']) p {
        color: var(--acs-color-text-muted);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.reflect({ tone: this.props?.tone ?? 'default' });
  }

  protected override render() {
    return html`<p>${this.props?.text ?? ''}</p>`;
  }
}

export const infoText: BaseComponent = {
  element: AcsInfoText,
  definition: {
    id: 'info.text',
    version: '1.0.0',
    category: 'info',
    tag: 'acs-info-text',
    propsSchema,
    events: [],
    bindings: [{ prop: 'text', kind: 'value' }],
    capabilities: [],
    accessibility: { role: 'paragraph', nameFrom: 'content', keyboard: [], requiredProps: [] },
  } satisfies ComponentDefinition,
};
