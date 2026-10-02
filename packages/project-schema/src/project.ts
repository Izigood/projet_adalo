import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import {
  IsoDateTimeUtcRef,
  LabelRef,
  LocaleRef,
  ProjectKeyRef,
  ReadableKeyRef,
  SemVerRef,
  Sha256HexRef,
  idOf,
} from './keys.js';
import { STRICT, ref, stringEnum } from './schema-kit.js';

/**
 * Reference to a secret held outside the manifest (EF-SEC-04). It never carries a value: the
 * schema rejects any other property, so a `value` or `password` cannot be smuggled in.
 */
export const SecretRef = Type.Object(
  {
    id: idOf<'secretRef'>(),
    key: ReadableKeyRef,
    description: Type.String({ maxLength: 500 }),
  },
  { ...STRICT, description: 'Secret reference (name only, never a value)' },
);

/** MVP: data stays on the device (decision D-03). Other modes arrive with the backend. */
export const STORAGE_MODES = ['local'] as const;

export const Project = Type.Object(
  {
    id: idOf<'project'>(),
    key: ProjectKeyRef,
    name: LabelRef,
    description: Type.String({ maxLength: 2000 }),
    author: Type.String({ maxLength: 200 }),
    version: SemVerRef,
    locale: LocaleRef,
    defaultThemeId: idOf<'theme'>(),
    storageMode: stringEnum(STORAGE_MODES),
  },
  STRICT,
);

export const VERSION_STATUSES = ['draft', 'frozen', 'published', 'archived'] as const;

/**
 * One entry of a project's history. Immutable as soon as it is `frozen` (RG-03). A draft has
 * neither checksum nor publication date yet.
 */
export const ProjectVersion = Type.Object(
  {
    semver: SemVerRef,
    status: stringEnum(VERSION_STATUSES),
    manifestVersion: Type.Integer({ minimum: 1 }),
    checksum: Type.Optional(Sha256HexRef),
    notes: Type.String({ maxLength: 2000 }),
    publishedAt: Type.Optional(IsoDateTimeUtcRef),
  },
  STRICT,
);

const caseInsensitive = (word: string) =>
  [...word]
    .map((letter) =>
      /[a-z]/i.test(letter) ? `[${letter.toLowerCase()}${letter.toUpperCase()}]` : letter,
    )
    .join('');

/**
 * A theme value ends up in a CSS custom property. It cannot close the declaration or the rule
 * (`;`, `{`, `}`), open markup (`<`, `>`), escape (`\`), start an at-rule (`@`), fetch a resource
 * (`url(`, `image-set(`, `image(`, `cross-fade(`, `src(`, `element(`, `paint(`), run legacy script
 * (`expression(`) or open a comment that would swallow what follows (`/*`), whatever the letter
 * case. Quotes stay allowed: font names need them. packages/design-system refuses the same values
 * (its own copy, as it cannot import this one); apps/runtime has a test that keeps both in step.
 */
export const RESOURCE_CSS_FUNCTIONS = [
  'url',
  'image-set',
  'image',
  'cross-fade',
  'src',
  'element',
  'paint',
  'expression',
] as const;

export const THEME_TOKEN_VALUE_PATTERN =
  `^(?![\\s\\S]*(?:/\\*|(?:${RESOURCE_CSS_FUNCTIONS.map(caseInsensitive).join('|')})\\s*\\())` +
  '[^;{}<>\\\\@!\\x00-\\x1f]{1,200}$';

/** Token names are dotted, like the design system's: `color.surface`, `space.1`. */
export const THEME_TOKEN_NAME_PATTERN = '^[a-z][a-zA-Z0-9-]*(\\.[a-z0-9][a-zA-Z0-9-]*)*$';

export const ThemeTokenValue = Type.String({ pattern: THEME_TOKEN_VALUE_PATTERN });

/** A map of token name to value. A property name that is not a token name is refused. */
export const ThemeTokens = Type.Unsafe<Record<string, string>>({
  type: 'object',
  patternProperties: { [THEME_TOKEN_NAME_PATTERN]: { $ref: 'ThemeTokenValue' } },
  additionalProperties: false,
});

/** A media file of the package, addressed by its hash: `assets/{hash}.{ext}` (dossier 6.1). */
export const ASSET_PATH_PATTERN = '^assets/[0-9a-f]{64}\\.[a-z0-9]{1,8}$';
export const AssetPath = Type.String({ pattern: ASSET_PATH_PATTERN });

const ThemeTokensRef = ref<typeof ThemeTokens>('ThemeTokens');

/**
 * `tokens` holds the values common to both modes; `modes` overrides them for `light` and `dark`.
 */
export const Theme = Type.Object(
  {
    id: idOf<'theme'>(),
    name: LabelRef,
    tokens: ThemeTokensRef,
    modes: Type.Object({ light: ThemeTokensRef, dark: ThemeTokensRef }, STRICT),
    assets: Type.Object(
      {
        logo: Type.Optional(ref<typeof AssetPath>('AssetPath')),
        icon: Type.Optional(ref<typeof AssetPath>('AssetPath')),
      },
      STRICT,
    ),
  },
  STRICT,
);

export type SecretRef = Static<typeof SecretRef>;
export type Project = Static<typeof Project>;
export type ProjectVersion = Static<typeof ProjectVersion>;
export type Theme = Static<typeof Theme>;
