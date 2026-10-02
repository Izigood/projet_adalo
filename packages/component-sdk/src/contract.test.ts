// @vitest-environment happy-dom
import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import { contractFindings } from './contract.js';
import type { ContractFindingCode } from './contract.js';
import type { ComponentDefinition } from './definition.js';
import { exampleDefinition } from './example-definition.js';

let counter = 0;

type Props = { label?: string };

/**
 * Defines a throw-away custom element whose shadow tree is built by `draw`, and the definition
 * that goes with it (a button named by its `label` prop, unless `overrides` say otherwise).
 */
function scenario(
  draw: (shadow: ShadowRoot, props: Props) => void,
  overrides: Partial<ComponentDefinition> = {},
): ComponentDefinition {
  counter += 1;
  const name = `t${counter}`;
  customElements.define(
    `acs-action-${name}`,
    class extends HTMLElement {
      set props(value: Props) {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        shadow.replaceChildren();
        draw(shadow, value);
      }
    },
  );
  return exampleDefinition({ id: `action.${name}`, tag: `acs-action-${name}`, ...overrides });
}

const make = (tag: string, text = '', attributes: Record<string, string> = {}) => {
  const element = document.createElement(tag);
  element.textContent = text;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
};

const codes = async (definition: ComponentDefinition): Promise<ContractFindingCode[]> =>
  (await contractFindings(definition)).map((finding) => finding.code);

const goodButton = (shadow: ShadowRoot, props: Props) =>
  shadow.append(make('button', props.label ?? ''));

describe('contractFindings', () => {
  it('passes a component that honours its definition', async () => {
    expect(await contractFindings(scenario(goodButton))).toEqual([]);
  });

  it('accepts a name carried by aria-label instead of the text', async () => {
    const definition = scenario((shadow, props) =>
      shadow.append(make('button', '', { 'aria-label': props.label ?? '' })),
    );
    expect(await codes(definition)).toEqual([]);
  });

  it('accepts an explicit role on a non-native element, once it can take focus', async () => {
    const definition = scenario((shadow, props) =>
      shadow.append(make('div', props.label, { role: 'button', tabindex: '0' })),
    );
    expect(await codes(definition)).toEqual([]);
  });

  describe('a component without accessibility metadata fails the contract (exit criterion)', () => {
    const base = exampleDefinition().accessibility;
    it.each([
      ['an empty role', { ...base, role: '' }],
      ['no role of ARIA', { ...base, role: 'clickable' }],
      ['no name source', { ...base, nameFrom: '' }],
      ['no keyboard keys on an interactive role', { ...base, keyboard: [] }],
      ['a required prop that does not exist', { ...base, requiredProps: ['nope'] }],
    ])('with %s', async (_name, accessibility) => {
      const definition = scenario(goodButton, { accessibility });
      expect(await codes(definition)).toContain('definition');
    });
  });

  it('refuses a component whose element is not defined', async () => {
    const definition = exampleDefinition({ id: 'action.nowhere', tag: 'acs-action-nowhere' });
    expect(await codes(definition)).toEqual(['element-not-defined']);
  });

  it('refuses a component that throws while rendering', async () => {
    const definition = scenario(() => {
      throw new Error('boom');
    });
    expect(await codes(definition)).toEqual(['render-failed']);
  });

  it('refuses a rendering that has no element with the declared role', async () => {
    const definition = scenario((shadow, props) => shadow.append(make('div', props.label)));
    expect(await codes(definition)).toContain('role-missing');
  });

  it('refuses an accessible name that is not the declared prop', async () => {
    const definition = scenario((shadow) => shadow.append(make('button', 'Autre texte')));
    expect(await codes(definition)).toEqual(['name-mismatch']);
  });

  it('refuses a role named by its content when the content is empty', async () => {
    customElements.define(
      'acs-info-empty',
      class extends HTMLElement {
        set props(_value: Props) {
          this.attachShadow({ mode: 'open' }).append(make('h2', ''));
        }
      },
    );
    const definition = exampleDefinition({
      id: 'info.empty',
      category: 'info',
      tag: 'acs-info-empty',
      accessibility: { role: 'heading', nameFrom: 'content', keyboard: [], requiredProps: [] },
    });
    expect(await codes(definition)).toEqual(['name-missing']);
  });

  it('refuses an interactive role that cannot take keyboard focus', async () => {
    const definition = scenario((shadow, props) =>
      shadow.append(make('div', props.label, { role: 'button' })),
    );
    expect(await codes(definition)).toEqual(['not-focusable']);
  });

  it('refuses a tabindex that takes the element out of the tab order', async () => {
    const definition = scenario((shadow, props) =>
      shadow.append(make('div', props.label, { role: 'button', tabindex: '-1' })),
    );
    expect(await codes(definition)).toEqual(['not-focusable']);
  });

  it('refuses an inline style attribute anywhere in the rendered tree', async () => {
    const definition = scenario((shadow, props) => {
      const button = make('button', props.label ?? '');
      button.append(make('span', 'x', { style: 'color: red' }));
      shadow.append(button);
    });
    expect(await codes(definition)).toContain('inline-style');
  });

  it('refuses an inline event handler attribute', async () => {
    const definition = scenario((shadow, props) =>
      shadow.append(make('button', props.label ?? '', { onclick: 'alert(1)' })),
    );
    expect(await codes(definition)).toContain('inline-handler');
  });

  it('reports sample props it cannot build', async () => {
    const definition = scenario(goodButton, {
      propsSchema: Type.Object(
        { label: Type.String({ pattern: '^[0-9]{3}-[A-Z]{2}$' }) },
        { additionalProperties: false },
      ),
    });
    expect(await codes(definition)).toContain('sample-invalid');
  });

  it('leaves the document as it found it', async () => {
    const before = document.body.childElementCount;
    await contractFindings(scenario(goodButton));
    await contractFindings(scenario(() => undefined));
    expect(document.body.childElementCount).toBe(before);
  });
});
