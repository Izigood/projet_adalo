import { contractFindings, parseRef, refOf } from '@acs/component-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import fr from './locales/fr.json';
import {
  BASE_COMPONENTS,
  BASE_DEFINITIONS,
  createBaseRegistry,
  defineBaseElements,
  paletteLabel,
} from './index.js';

beforeAll(() => defineBaseElements());

describe('the base library honours the generic contract of components (EF-CMP-01)', () => {
  it.each(BASE_DEFINITIONS.map((definition) => [definition.id, definition] as const))(
    '%s passes the contract test',
    async (_id, definition) => {
      expect(await contractFindings(definition)).toEqual([]);
    },
  );

  it('registers every component: each definition is valid and none clashes with another', () => {
    const registry = createBaseRegistry();
    expect(registry.definitions()).toHaveLength(BASE_DEFINITIONS.length);
    for (const definition of BASE_DEFINITIONS) {
      expect(registry.resolve(refOf(definition)), definition.id).toBe(definition);
    }
  });

  it('gives every component the element its tag names', () => {
    for (const { definition, element } of BASE_COMPONENTS) {
      expect(customElements.get(definition.tag), definition.tag).toBe(element);
    }
  });

  it('can define the elements twice without error', () => {
    expect(() => defineBaseElements()).not.toThrow();
  });

  it('declares no capability: a base component asks nothing of the Runtime', () => {
    for (const definition of BASE_DEFINITIONS)
      expect(definition.capabilities, definition.id).toEqual([]);
  });

  it('lists only components of the base families, as the dossier does (4.5)', () => {
    const families = new Set(['structure', 'navigation', 'info', 'action']);
    for (const definition of BASE_DEFINITIONS) {
      expect(families.has(definition.category), definition.id).toBe(true);
      expect(parseRef(refOf(definition))?.id).toBe(definition.id);
    }
  });
});

describe('the palette labels (ENF-10)', () => {
  it('has a French name for every component, and none for a component that does not exist', () => {
    for (const definition of BASE_DEFINITIONS) {
      expect(paletteLabel(definition.id), definition.id).toBeTruthy();
    }
    const known = new Set(BASE_DEFINITIONS.map((definition) => `component.${definition.id}`));
    const palette = Object.keys(fr).filter((key) => key.startsWith('component.'));
    expect(palette.filter((key) => !known.has(key))).toEqual([]);
  });
});
