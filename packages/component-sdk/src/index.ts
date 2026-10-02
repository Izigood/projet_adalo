export const PACKAGE_NAME = '@acs/component-sdk';

export { CAPABILITIES, COMPONENT_CATEGORIES, majorOf, parseRef, refOf } from './definition.js';
export type {
  AccessibilityMetadata,
  BindingDefinition,
  Capability,
  ComponentCategory,
  ComponentDefinition,
  ComponentMigration,
  EventDefinition,
  PropsRecord,
  SlotDefinition,
} from './definition.js';
export { exampleDefinition } from './example-definition.js';
export { createRegistry } from './registry.js';
export type { ComponentRegistry } from './registry.js';
export {
  ARIA_ROLES,
  INTERACTIVE_ROLES,
  definitionIssues,
  expectedTag,
  validateDefinition,
} from './validate-definition.js';
export type { DefinitionIssue } from './validate-definition.js';
export { sampleProps, validateProps } from './props.js';
export { contractFindings } from './contract.js';
export type { ContractFinding, ContractFindingCode } from './contract.js';
export {
  BREAKPOINT_MIN_WIDTH,
  BREAKPOINT_QUERIES,
  breakpointOf,
  ignoredOverrides,
  resolveProps,
} from './breakpoints.js';
export type { Breakpoint, ResponsiveNode } from './breakpoints.js';
export { deprecationNotices } from './deprecation.js';
export type { DeprecationNotice } from './deprecation.js';
export { planMigration } from './migration.js';
export type { MigrationPlan, PropChange } from './migration.js';
