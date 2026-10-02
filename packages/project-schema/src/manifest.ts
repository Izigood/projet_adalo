import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Entity, Query, Relation } from './data-model.js';
import { ComponentReferenceRef, SemVerRef } from './keys.js';
import { Project, SecretRef } from './project.js';
import { Role } from './role.js';
import { STRICT, ref } from './schema-kit.js';

/**
 * Format version written by this code. A manifest of an older version is migrated first
 * (`migrations.ts`); a newer one is refused (`MANIFEST_UNSUPPORTED`, dossier 6.5).
 */
export const CURRENT_MANIFEST_VERSION = 1;

/**
 * A JSON file of the package, by relative path (dossier 6.1). No leading `/`, no `..`, no
 * backslash and no control character: the zip-slip rules of SEC-01 hold in the manifest too.
 */
export const MANIFEST_PATH_PATTERN = '^(?!/)(?!.*\\.\\.)[a-zA-Z0-9_./-]{1,200}\\.json$';
export const ManifestPath = Type.String({ pattern: MANIFEST_PATH_PATTERN });
const ManifestPathRef = ref<typeof ManifestPath>('ManifestPath');

/** `project.json`: the root of the package (dossier 6.1). */
export const ProjectManifest = Type.Object(
  {
    manifestVersion: Type.Literal(CURRENT_MANIFEST_VERSION),
    project: ref<typeof Project>('Project'),
    runtime: Type.Object({ minVersion: SemVerRef }, STRICT),
    entries: Type.Object(
      {
        schema: ManifestPathRef,
        roles: ManifestPathRef,
        pages: ManifestPathRef,
        queries: ManifestPathRef,
        themes: Type.Array(ManifestPathRef, { minItems: 1 }),
        workflows: Type.Array(ManifestPathRef),
      },
      STRICT,
    ),
    dependencies: Type.Object({ components: Type.Array(ComponentReferenceRef) }, STRICT),
    secretRefs: Type.Optional(Type.Array(ref<typeof SecretRef>('SecretRef'))),
  },
  STRICT,
);

/** `schema/entities.json` */
export const EntitiesFile = Type.Object(
  {
    entities: Type.Array(ref<typeof Entity>('Entity')),
    relations: Type.Array(ref<typeof Relation>('Relation')),
  },
  STRICT,
);

/** `schema/roles.json` */
export const RolesFile = Type.Object({ roles: Type.Array(ref<typeof Role>('Role')) }, STRICT);

/** `queries/index.json` */
export const QueriesFile = Type.Object({ queries: Type.Array(ref<typeof Query>('Query')) }, STRICT);

export type ProjectManifest = Static<typeof ProjectManifest>;
export type EntitiesFile = Static<typeof EntitiesFile>;
export type RolesFile = Static<typeof RolesFile>;
export type QueriesFile = Static<typeof QueriesFile>;
