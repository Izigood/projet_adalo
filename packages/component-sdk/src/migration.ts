import { domainError, err, ok } from '@acs/domain';
import type { DomainError, Result } from '@acs/domain';
import { majorOf, parseRef } from './definition.js';
import type { PropsRecord } from './definition.js';
import { validateProps } from './props.js';
import type { ComponentRegistry } from './registry.js';

export type PropChange =
  | { readonly kind: 'added'; readonly prop: string; readonly after: unknown }
  | { readonly kind: 'removed'; readonly prop: string; readonly before: unknown }
  | {
      readonly kind: 'changed';
      readonly prop: string;
      readonly before: unknown;
      readonly after: unknown;
    };

/**
 * What migrating a node to the current major of its component would do (EF-CMP-03). Nothing is
 * applied: the Studio turns a plan into an undoable command, with `before` as its inverse.
 */
export type MigrationPlan = {
  readonly from: string;
  readonly to: string;
  readonly before: PropsRecord;
  readonly after: PropsRecord;
  readonly changes: readonly PropChange[];
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diff(before: PropsRecord, after: PropsRecord): PropChange[] {
  const changes: PropChange[] = [];
  for (const prop of Object.keys(before)) {
    if (!Object.hasOwn(after, prop)) changes.push({ kind: 'removed', prop, before: before[prop] });
    else if (!same(before[prop], after[prop])) {
      changes.push({ kind: 'changed', prop, before: before[prop], after: after[prop] });
    }
  }
  for (const prop of Object.keys(after)) {
    if (!Object.hasOwn(before, prop)) changes.push({ kind: 'added', prop, after: after[prop] });
  }
  return changes;
}

const refuse = (
  message: string,
  details: Record<string, unknown> = {},
): Result<never, DomainError> => err(domainError('COMPONENT_INVALID', message, { details }));

/**
 * The plan to bring a node's props from the major its reference names to the latest registered
 * major of the component, applying the migrations the latest definition declares, one major at a
 * time. Each step gets its own copy of the props, so a step cannot alter `props`. The result is
 * checked against the props schema of the latest definition: a migration that produces invalid
 * props is refused rather than offered.
 */
export function planMigration(
  registry: ComponentRegistry,
  ref: string,
  props: PropsRecord,
): Result<MigrationPlan, DomainError> {
  const parsed = parseRef(ref);
  if (parsed === undefined) return refuse(`${ref} is not a component reference`);
  const versions = registry.versionsOf(parsed.id);
  const latest = versions[versions.length - 1];
  if (latest === undefined || registry.resolve(ref) === undefined) {
    return refuse(`${ref} is not registered`, { ref });
  }
  const latestMajor = majorOf(latest.version) ?? parsed.major;
  const to = `${parsed.id}@${latestMajor}`;
  const before = structuredClone(props);
  let current: PropsRecord = before;
  for (let major = parsed.major; major < latestMajor; major += 1) {
    const step = latest.migrations?.find((migration) => migration.from === major);
    if (step === undefined) return refuse(`no migration from ${parsed.id}@${major}`, { ref });
    current = step.migrate(structuredClone(current));
  }
  const checked = validateProps(latest, current);
  if (!checked.ok) return checked;
  return ok({ from: ref, to, before, after: checked.value, changes: diff(before, checked.value) });
}
