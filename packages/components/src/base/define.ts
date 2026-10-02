import type { ComponentDefinition } from '@acs/component-sdk';

/** A component of the library: its contract and the element that implements it. */
export type BaseComponent = {
  readonly definition: ComponentDefinition;
  readonly element: CustomElementConstructor;
};

/**
 * Defines the custom elements of the given components. Defining is global and can happen once per
 * tag, so a tag that is already defined is left alone: calling this twice is harmless.
 */
export function defineElements(components: readonly BaseComponent[]): void {
  for (const { definition, element } of components) {
    if (customElements.get(definition.tag) === undefined) {
      customElements.define(definition.tag, element);
    }
  }
}
