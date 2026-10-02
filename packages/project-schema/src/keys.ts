import { UUID_V7_PATTERN } from '@acs/domain';
import type { Id } from '@acs/domain';
import { Type } from '@sinclair/typebox';
import type { TUnsafe } from '@sinclair/typebox';

/** RG-11: readable key of an entity, field, page or workflow. */
export const READABLE_KEY_PATTERN = '^[a-z][a-zA-Z0-9_]{0,63}$';
/** RG-11: key of a project. */
export const PROJECT_KEY_PATTERN = '^[A-Z][A-Z0-9]{1,15}$';

/** Semantic Versioning 2.0.0 (semver.org reference expression). */
export const SEMVER_PATTERN =
  '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)' +
  '(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?' +
  '(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$';

/** `YYYY-MM-DD`, without time zone (dossier 6.3). Month and day ranges only, not the calendar. */
export const ISO_DATE_PATTERN = '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$';
/** ISO 8601 UTC instant (dossier 6.3): `2026-10-02T14:03:07Z`, optional fractional seconds. */
export const ISO_DATETIME_UTC_PATTERN =
  '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{1,9})?Z$';

/** Component reference `famille.nom@majeure` (dossier 6.2 and 7.3), e.g. `data.list@1`. */
export const COMPONENT_REF_PATTERN = '^[a-z][a-z0-9]*\\.[a-z][a-zA-Z0-9]*@[1-9][0-9]*$';

export const SHA256_HEX_PATTERN = '^[0-9a-f]{64}$';
/** Language tag limited to `fr` or `fr-FR` style values. */
export const LOCALE_PATTERN = '^[a-z]{2}(-[A-Z]{2})?$';

/** UUID v7 identifier. The brand records which object kind it designates (never use a label). */
export const idOf = <Kind extends string>(description?: string): TUnsafe<Id<Kind>> =>
  Type.Unsafe<Id<Kind>>(
    Type.String({
      pattern: UUID_V7_PATTERN,
      ...(description === undefined ? {} : { description }),
    }),
  );

export const ReadableKey = Type.String({
  pattern: READABLE_KEY_PATTERN,
  description:
    'Readable key (RG-11): lower-case first letter, letters, digits and underscore, 64 max',
});
export const ProjectKey = Type.String({
  pattern: PROJECT_KEY_PATTERN,
  description: 'Project key (RG-11): 2 to 16 upper-case letters and digits',
});
export const SemVer = Type.String({ pattern: SEMVER_PATTERN });
export const IsoDate = Type.String({ pattern: ISO_DATE_PATTERN });
export const IsoDateTimeUtc = Type.String({ pattern: ISO_DATETIME_UTC_PATTERN });
export const ComponentRef = Type.String({ pattern: COMPONENT_REF_PATTERN });
export const Sha256Hex = Type.String({ pattern: SHA256_HEX_PATTERN });
export const Locale = Type.String({ pattern: LOCALE_PATTERN });

/** Data classification carried by entities and fields from the start (decision D-10). */
export const Classification = Type.Union(
  [Type.Literal('public'), Type.Literal('interne'), Type.Literal('sensible')],
  { description: 'Data classification (D-10)' },
);
