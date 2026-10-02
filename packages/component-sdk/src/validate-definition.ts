import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import { CAPABILITIES, COMPONENT_CATEGORIES, majorOf, parseRef } from './definition.js';
import type { ComponentDefinition } from './definition.js';

/** WAI-ARIA roles a component of the base library may declare. */
export const ARIA_ROLES: ReadonlySet<string> = new Set([
  'alert',
  'alertdialog',
  'article',
  'banner',
  'button',
  'checkbox',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'figure',
  'form',
  'grid',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'main',
  'menu',
  'menubar',
  'menuitem',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'progressbar',
  'radio',
  'region',
  'search',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treeitem',
]);

/** A component with one of these roles answers to the keyboard, so it must say which keys. */
export const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  'alertdialog',
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'grid',
  'link',
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'option',
  'radio',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'textbox',
  'tree',
  'treeitem',
]);

const ID = /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*$/;
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;

/** `sidePanel` -> `side-panel` */
const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** The element name of a definition: the major version is in it from the second one (ADR-0034). */
export function expectedTag(definition: Pick<ComponentDefinition, 'id' | 'category' | 'version'>) {
  const name = definition.id.split('.')[1] ?? '';
  const major = majorOf(definition.version) ?? 1;
  return `acs-${definition.category}-${kebab(name)}${major > 1 ? `-v${major}` : ''}`;
}

export type DefinitionIssue = {
  readonly component: string;
  readonly path: string;
  readonly message: string;
};

/**
 * Checks a definition against the contract (EF-CMP-01, ADR-0034) and reports every fault at once,
 * each with the JSON-pointer-like path of the faulty property. It decides nothing about the
 * registry: a duplicate is the registry's concern.
 */
export function definitionIssues(definition: ComponentDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const at = (path: string, message: string) =>
    issues.push({ component: String(definition.id), path, message });

  if (typeof definition.id !== 'string' || !ID.test(definition.id)) {
    at('/id', 'must be `family.name`: lower-case family, camelCase name');
  } else if (definition.id.split('.')[0] !== definition.category) {
    at('/id', 'the family of the id must be the category');
  }
  if (!COMPONENT_CATEGORIES.includes(definition.category)) at('/category', 'unknown category');
  if (majorOf(definition.version) === undefined) at('/version', 'must be a SemVer string');
  else if (typeof definition.id === 'string' && ID.test(definition.id)) {
    const tag = expectedTag(definition);
    if (definition.tag !== tag) at('/tag', `must be ${tag}`);
  }

  const schema = definition.propsSchema as unknown as {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: unknown;
  };
  const isObject = schema?.type === 'object' && typeof schema.properties === 'object';
  if (!isObject) at('/propsSchema', 'must be a TypeBox object');
  else if (schema.additionalProperties !== false) {
    at('/propsSchema/additionalProperties', 'must be false: unknown props are refused');
  }
  const props = isObject ? Object.keys(schema.properties ?? {}) : [];
  const required = isObject ? (schema.required ?? []) : [];
  for (const name of props) {
    if (!CAMEL.test(name)) at(`/propsSchema/properties/${name}`, 'prop names are camelCase');
  }

  const eventNames = new Set<string>();
  definition.events?.forEach((event, i) => {
    if (!CAMEL.test(event.name ?? '')) at(`/events/${i}/name`, 'event names are camelCase');
    if (eventNames.has(event.name)) at(`/events/${i}/name`, 'duplicate event');
    eventNames.add(event.name);
    if (typeof event.description !== 'string' || event.description.trim() === '') {
      at(`/events/${i}/description`, 'must say what the event means');
    }
  });

  const slotNames = new Set<string>();
  definition.slots?.forEach((slot, i) => {
    if (!CAMEL.test(slot.name ?? '')) at(`/slots/${i}/name`, 'slot names are camelCase');
    if (slotNames.has(slot.name)) at(`/slots/${i}/name`, 'duplicate slot');
    slotNames.add(slot.name);
    if (slot.max !== undefined && (!Number.isInteger(slot.max) || slot.max < 1)) {
      at(`/slots/${i}/max`, 'must be a positive integer');
    }
  });

  const bound = new Set<string>();
  definition.bindings?.forEach((binding, i) => {
    if (!props.includes(binding.prop)) at(`/bindings/${i}/prop`, 'not a prop of the schema');
    if (bound.has(binding.prop)) at(`/bindings/${i}/prop`, 'duplicate binding');
    bound.add(binding.prop);
  });

  const capabilities = new Set<string>();
  definition.capabilities?.forEach((capability, i) => {
    if (!(CAPABILITIES as readonly string[]).includes(capability)) {
      at(`/capabilities/${i}`, 'unknown capability');
    }
    if (capabilities.has(capability)) at(`/capabilities/${i}`, 'duplicate capability');
    capabilities.add(capability);
  });
  if (!Array.isArray(definition.capabilities)) at('/capabilities', 'must be a list');

  const a11y = definition.accessibility;
  if (typeof a11y?.role !== 'string' || a11y.role.trim() === '') {
    at('/accessibility/role', 'must name an ARIA role');
  } else {
    if (!ARIA_ROLES.has(a11y.role)) at('/accessibility/role', 'not a known ARIA role');
    if (INTERACTIVE_ROLES.has(a11y.role) && !(a11y.keyboard?.length > 0)) {
      at('/accessibility/keyboard', 'an interactive role must list the keys it answers to');
    }
  }
  const nameFrom = a11y?.nameFrom;
  if (nameFrom === 'content') {
    // the accessible name is the content itself
  } else if (typeof nameFrom === 'string' && nameFrom.startsWith('prop:')) {
    const prop = nameFrom.slice('prop:'.length);
    if (!props.includes(prop)) at('/accessibility/nameFrom', 'names a prop that does not exist');
    else if (!required.includes(prop)) {
      at('/accessibility/nameFrom', 'the prop that gives the name must be required');
    }
  } else {
    at('/accessibility/nameFrom', 'must be `content` or `prop:<name>`');
  }
  if (!Array.isArray(a11y?.keyboard)) at('/accessibility/keyboard', 'must be a list of keys');
  else {
    a11y.keyboard.forEach((key, i) => {
      if (typeof key !== 'string' || key.trim() === '') {
        at(`/accessibility/keyboard/${i}`, 'must be a key name');
      }
    });
  }
  if (!Array.isArray(a11y?.requiredProps)) at('/accessibility/requiredProps', 'must be a list');
  else {
    a11y.requiredProps.forEach((name, i) => {
      if (!required.includes(name)) {
        at(`/accessibility/requiredProps/${i}`, 'must be a required prop of the schema');
      }
    });
  }

  definition.responsive?.forEach((name, i) => {
    if (!props.includes(name)) at(`/responsive/${i}`, 'not a prop of the schema');
  });

  const currentMajor = majorOf(definition.version) ?? 0;
  const from = new Set<number>();
  definition.migrations?.forEach((migration, i) => {
    if (!Number.isInteger(migration.from) || migration.from < 1) {
      at(`/migrations/${i}/from`, 'must be a major version');
    }
    if (migration.to !== migration.from + 1) at(`/migrations/${i}/to`, 'must be from + 1');
    if (migration.to > currentMajor) at(`/migrations/${i}/to`, 'is beyond the current version');
    if (from.has(migration.from)) at(`/migrations/${i}/from`, 'duplicate migration');
    from.add(migration.from);
    if (typeof migration.migrate !== 'function')
      at(`/migrations/${i}/migrate`, 'must be a function');
  });

  if (definition.deprecated !== undefined) {
    if (majorOf(definition.deprecated.since) === undefined) {
      at('/deprecated/since', 'must be a SemVer string');
    }
    const replacement = definition.deprecated.replacement;
    if (replacement !== undefined && parseRef(replacement) === undefined) {
      at('/deprecated/replacement', 'must be a reference like `family.name@2`');
    }
  }
  return issues;
}

/** `definitionIssues` as a Result: a refusal is `COMPONENT_INVALID` naming the component. */
export function validateDefinition(
  definition: ComponentDefinition,
): Result<ComponentDefinition, DomainError> {
  const issues = definitionIssues(definition);
  return issues.length === 0
    ? ok(definition)
    : err(
        domainError('COMPONENT_INVALID', `component ${String(definition.id)} breaks the contract`, {
          details: { issues },
        }),
      );
}
