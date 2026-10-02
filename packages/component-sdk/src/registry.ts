import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import { majorOf, parseRef, refOf } from './definition.js';
import type { ComponentDefinition } from './definition.js';
import { validateDefinition } from './validate-definition.js';

/** The components the Runtime knows, by reference (`id@major`). */
export type ComponentRegistry = {
  /** Validates the definition (EF-CMP-01), then adds it. A refusal leaves the registry unchanged. */
  register(definition: ComponentDefinition): Result<void, DomainError>;
  /** The definition a manifest reference (`structure.stack@1`) designates, if registered. */
  resolve(ref: string): ComponentDefinition | undefined;
  /** The registered majors of one component, oldest first. */
  versionsOf(id: string): readonly ComponentDefinition[];
  /** Every registered definition, in registration order. */
  definitions(): readonly ComponentDefinition[];
};

export function createRegistry(): ComponentRegistry {
  const byRef = new Map<string, ComponentDefinition>();
  const tags = new Map<string, string>();

  const refuse = (definition: ComponentDefinition, path: string, message: string) =>
    err(
      domainError('COMPONENT_INVALID', `component ${definition.id} cannot be registered`, {
        details: { issues: [{ component: definition.id, path, message }] },
      }),
    );

  return {
    register(definition) {
      const valid = validateDefinition(definition);
      if (!valid.ok) return valid;
      const ref = refOf(definition);
      if (byRef.has(ref)) return refuse(definition, '/id', `${ref} is already registered`);
      const owner = tags.get(definition.tag);
      if (owner !== undefined) return refuse(definition, '/tag', `the tag belongs to ${owner}`);
      byRef.set(ref, definition);
      tags.set(definition.tag, ref);
      return ok(undefined);
    },
    resolve(ref) {
      return parseRef(ref) === undefined ? undefined : byRef.get(ref);
    },
    versionsOf(id) {
      return [...byRef.values()]
        .filter((definition) => definition.id === id)
        .sort((a, b) => (majorOf(a.version) ?? 0) - (majorOf(b.version) ?? 0));
    },
    definitions() {
      return [...byRef.values()];
    },
  };
}
