import type { ComponentRegistry } from './registry.js';

export type DeprecationNotice = {
  /** The reference the manifest uses: `structure.tabs@1`. */
  readonly ref: string;
  readonly since: string;
  readonly replacement?: string;
};

/**
 * The deprecated components among the references a project uses (EF-CMP-03), each once. A
 * reference the registry does not know is not a deprecation: the validator reports it elsewhere.
 */
export function deprecationNotices(
  registry: ComponentRegistry,
  refs: Iterable<string>,
): DeprecationNotice[] {
  const notices: DeprecationNotice[] = [];
  for (const ref of new Set(refs)) {
    const deprecated = registry.resolve(ref)?.deprecated;
    if (deprecated === undefined) continue;
    notices.push(
      deprecated.replacement === undefined
        ? { ref, since: deprecated.since }
        : { ref, since: deprecated.since, replacement: deprecated.replacement },
    );
  }
  return notices;
}
