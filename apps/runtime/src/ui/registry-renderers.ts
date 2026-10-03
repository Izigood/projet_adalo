import { refOf, resolveProps, validateProps } from '@acs/component-sdk';
import type { Breakpoint, ComponentDefinition, ComponentRegistry } from '@acs/component-sdk';
import { html, unsafeStatic } from 'lit/static-html.js';
import type { NodeRenderer, NodeRenderers } from './render-page.js';

/**
 * The element names a definition can have: `acs-<category>-<name>` with `-v<major>` from the second
 * major (ADR-0034). The registry already refuses any other tag; this is checked again because the
 * tag is the one thing put into a template as text, not as a value.
 */
const SAFE_TAG = /^acs-[a-z]+(-[a-z0-9]+)+$/;

function rendererOf(definition: ComponentDefinition, breakpoint: Breakpoint): NodeRenderer {
  return (node, children) => {
    if (!SAFE_TAG.test(definition.tag)) throw new Error(`unsafe element name: ${definition.tag}`);
    const resolved = resolveProps(definition, node, breakpoint);
    const checked = validateProps(definition, resolved);
    if (!checked.ok) {
      throw new Error(`${checked.error.message}: ${JSON.stringify(checked.error.details)}`);
    }
    const tag = unsafeStatic(definition.tag);
    return html`<${tag} .props=${checked.value}>${children}</${tag}>`;
  };
}

/**
 * One renderer per component of the registry, keyed by its manifest reference. A node is drawn by
 * its element, given the props of the current breakpoint (the overrides that the component allows)
 * once they have been checked against its schema: invalid props make the node fail, which its error
 * boundary turns into a marker (lot 2) instead of a broken component. The elements stay in the DOM
 * from one render to the next, so a component keeps its own state (the open tab, the open menu).
 */
export function renderersFromRegistry(
  registry: ComponentRegistry,
  breakpoint: Breakpoint,
): NodeRenderers {
  return Object.fromEntries(
    registry
      .definitions()
      .map((definition) => [refOf(definition), rendererOf(definition, breakpoint)]),
  );
}
