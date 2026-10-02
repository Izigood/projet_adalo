import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { LabelRef, SemVerRef, Sha256HexRef } from './keys.js';
import { STRICT, stringEnum } from './schema-kit.js';

/**
 * What a plugin may ask the Runtime for. The same list as `Capability` in `component-sdk`, which
 * cannot be imported here (table 9.2); a test in `component-sdk` keeps both in step.
 */
export const PLUGIN_CAPABILITIES = [
  'data.read',
  'data.write',
  'files.read',
  'files.write',
] as const;

const BUILT_IN_FAMILIES = [
  'structure',
  'navigation',
  'input',
  'data',
  'info',
  'action',
  'business',
];

/** `acme-gantt`: lower-case words joined by dashes. */
export const PLUGIN_ID_PATTERN = '^[a-z][a-z0-9]*(-[a-z0-9]+)*$';

/**
 * `family.name` like a built-in component, but the family can never be one of the built-in ones:
 * a plugin cannot take the place of `data.list`.
 */
export const PLUGIN_COMPONENT_ID_PATTERN = `^(?!(?:${BUILT_IN_FAMILIES.join('|')})\\.)[a-z][a-z0-9]*\\.[a-z][a-zA-Z0-9]*$`;

/** Elements of plugins are `acs-x-…`, which no built-in element is (they are `acs-<category>-…`). */
export const PLUGIN_TAG_PATTERN = '^acs-x-[a-z0-9]+(-[a-z0-9]+)*$';

/** The script of the plugin, relative to its folder: no `..`, no leading `/`, a `.js` file. */
export const PLUGIN_ENTRY_PATTERN = '^(?!/)(?!.*\\.\\.)[a-zA-Z0-9_./-]{1,200}\\.js$';

/**
 * The manifest of a plugin (ADR-0034, decision D-05). It is specified here so that the format is
 * fixed, and validated like any other file, but **nothing loads a plugin** before lot 19: the
 * Runtime shows a component of a plugin as unavailable, and no code path reads this file. The
 * signature is optional: signing is lot 19 (REC-07).
 */
export const PluginManifest = Type.Object(
  {
    manifestVersion: Type.Literal(1),
    id: Type.String({ pattern: PLUGIN_ID_PATTERN, maxLength: 64 }),
    name: LabelRef,
    version: SemVerRef,
    publisher: LabelRef,
    components: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: PLUGIN_COMPONENT_ID_PATTERN }),
          tag: Type.String({ pattern: PLUGIN_TAG_PATTERN, maxLength: 100 }),
        },
        STRICT,
      ),
      { minItems: 1 },
    ),
    capabilities: Type.Array(stringEnum(PLUGIN_CAPABILITIES)),
    entry: Type.String({ pattern: PLUGIN_ENTRY_PATTERN }),
    /** SHA-256 of the entry script. */
    integrity: Sha256HexRef,
    signature: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
  },
  STRICT,
);

export type PluginManifest = Static<typeof PluginManifest>;
