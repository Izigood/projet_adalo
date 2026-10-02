import { COMPONENT_REF_PATTERN, SEMVER_PATTERN } from '@acs/project-schema';
import type { TObject, TSchema } from '@sinclair/typebox';

export const COMPONENT_CATEGORIES = [
  'structure',
  'navigation',
  'input',
  'data',
  'info',
  'action',
  'business',
] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

/** What a component may ask the Runtime to do for it. Refused unless declared (dossier 7.3). */
export const CAPABILITIES = ['data.read', 'data.write', 'files.read', 'files.write'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** An event the component emits, as the DOM event `acs-<name>` (ADR-0034). */
export type EventDefinition = {
  readonly name: string;
  readonly description: string;
  readonly payload?: TSchema;
};

/** A place for children; `accepts` lists component ids or categories, `max` the child count. */
export type SlotDefinition = {
  readonly name: string;
  readonly accepts?: readonly string[];
  readonly max?: number;
};

/** A prop the bindings of lot 8 can feed. */
export type BindingDefinition = {
  readonly prop: string;
  readonly kind: 'value' | 'collection' | 'record';
};

export type PropsRecord = Readonly<Record<string, unknown>>;

/** A pure step from one major version of the component to the next (EF-CMP-03). */
export type ComponentMigration = {
  readonly from: number;
  readonly to: number;
  readonly description: string;
  readonly migrate: (props: PropsRecord) => PropsRecord;
};

/**
 * `role` is the ARIA role; `nameFrom` is `content` or `prop:<name>`; `keyboard` lists the keys the
 * component answers to (required for an interactive role); `requiredProps` must exist in the
 * props schema.
 */
export type AccessibilityMetadata = {
  readonly role: string;
  readonly nameFrom: string;
  readonly keyboard: readonly string[];
  readonly requiredProps: readonly string[];
};

/** The contract of a component (dossier 7.3, completed by ADR-0034). */
export type ComponentDefinition = {
  /** `family.name`, the family being the category: `structure.stack`. */
  readonly id: string;
  /** SemVer; the manifest refers to its major: `structure.stack@1`. */
  readonly version: string;
  readonly category: ComponentCategory;
  /** The Lit element: `acs-structure-stack`. */
  readonly tag: string;
  readonly propsSchema: TObject;
  readonly events: readonly EventDefinition[];
  readonly slots?: readonly SlotDefinition[];
  readonly bindings?: readonly BindingDefinition[];
  readonly capabilities: readonly Capability[];
  readonly accessibility: AccessibilityMetadata;
  /** Props a node may override per breakpoint. */
  readonly responsive?: readonly string[];
  readonly migrations?: readonly ComponentMigration[];
  readonly deprecated?: { readonly since: string; readonly replacement?: string };
};

const SEMVER = new RegExp(SEMVER_PATTERN);
const REF = new RegExp(COMPONENT_REF_PATTERN);

/** The major version of a SemVer string, or `undefined` when it is not one. */
export function majorOf(version: string): number | undefined {
  if (!SEMVER.test(version)) return undefined;
  return Number(version.split('.')[0]);
}

/** `structure.stack@1`: what a manifest node writes for this definition. */
export function refOf(definition: Pick<ComponentDefinition, 'id' | 'version'>): string {
  return `${definition.id}@${majorOf(definition.version) ?? 0}`;
}

/** Splits a manifest reference into its id and major version. */
export function parseRef(ref: string): { readonly id: string; readonly major: number } | undefined {
  if (!REF.test(ref)) return undefined;
  const [id, major] = ref.split('@');
  return id === undefined || major === undefined ? undefined : { id, major: Number(major) };
}
