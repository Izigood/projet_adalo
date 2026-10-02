import { Type } from '@sinclair/typebox';
import type { ComponentDefinition } from './definition.js';

/**
 * A valid definition to start from in tests: change what a test is about with `overrides`. It is
 * part of the kit so that component packages can build the faulty variants their contract tests
 * need.
 */
export function exampleDefinition(
  overrides: Partial<ComponentDefinition> = {},
): ComponentDefinition {
  return {
    id: 'action.example',
    version: '1.0.0',
    category: 'action',
    tag: 'acs-action-example',
    propsSchema: Type.Object(
      { label: Type.String({ minLength: 1 }), disabled: Type.Optional(Type.Boolean()) },
      { additionalProperties: false },
    ),
    events: [{ name: 'press', description: 'The user pressed the button.' }],
    capabilities: [],
    accessibility: {
      role: 'button',
      nameFrom: 'prop:label',
      keyboard: ['Enter', 'Space'],
      requiredProps: ['label'],
    },
    responsive: ['disabled'],
    ...overrides,
  };
}
