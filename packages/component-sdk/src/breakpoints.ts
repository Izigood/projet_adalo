import { BREAKPOINTS } from '@acs/project-schema';
import type { ComponentDefinition, PropsRecord } from './definition.js';

export type Breakpoint = (typeof BREAKPOINTS)[number];

/** The narrowest viewport of each breakpoint (EF-UI-04): mobile below 600 px, tablet below 1024. */
export const BREAKPOINT_MIN_WIDTH: Readonly<Record<Breakpoint, number>> = {
  mobile: 0,
  tablet: 600,
  desktop: 1024,
};

/** Media queries that flip at the same widths, for `matchMedia`. */
export const BREAKPOINT_QUERIES: Readonly<Record<Exclude<Breakpoint, 'mobile'>, string>> = {
  tablet: `(min-width: ${BREAKPOINT_MIN_WIDTH.tablet}px)`,
  desktop: `(min-width: ${BREAKPOINT_MIN_WIDTH.desktop}px)`,
};

/** The breakpoint of a viewport width in CSS pixels. A width that is not a number is mobile. */
export function breakpointOf(width: number): Breakpoint {
  if (width >= BREAKPOINT_MIN_WIDTH.desktop) return 'desktop';
  if (width >= BREAKPOINT_MIN_WIDTH.tablet) return 'tablet';
  return 'mobile';
}

export type ResponsiveNode = {
  readonly props: PropsRecord;
  readonly responsive?: Readonly<Partial<Record<Breakpoint, PropsRecord>>>;
};

/** The overrides of a node that its component does not allow (`responsive` of the definition). */
export function ignoredOverrides(
  definition: Pick<ComponentDefinition, 'responsive'>,
  node: ResponsiveNode,
): { readonly breakpoint: Breakpoint; readonly prop: string }[] {
  const allowed = new Set(definition.responsive ?? []);
  return BREAKPOINTS.flatMap((breakpoint) =>
    Object.keys(node.responsive?.[breakpoint] ?? {})
      .filter((prop) => !allowed.has(prop))
      .map((prop) => ({ breakpoint, prop })),
  );
}

/**
 * The props of a node at a breakpoint: its own props, with the overrides of that breakpoint laid
 * over them, for the props the component declares overridable. Anything else in `responsive` is
 * ignored, whatever its name.
 */
export function resolveProps(
  definition: Pick<ComponentDefinition, 'responsive'>,
  node: ResponsiveNode,
  breakpoint: Breakpoint,
): PropsRecord {
  const allowed = new Set(definition.responsive ?? []);
  const overrides = node.responsive?.[breakpoint] ?? {};
  const applied = Object.entries(overrides).filter(
    ([prop]) => allowed.has(prop) && Object.hasOwn(overrides, prop),
  );
  return Object.fromEntries([...Object.entries(node.props), ...applied]);
}
