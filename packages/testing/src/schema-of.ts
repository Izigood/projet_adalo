import type { EntitiesFile, PackageFiles, ProjectManifest } from '@acs/project-schema';

/** The entities and relations of a package built by the fixtures (no schema in it: empty lists). */
export function schemaOf(
  files: PackageFiles,
): Required<Pick<EntitiesFile, 'entities' | 'relations'>> {
  const manifest = files['project.json'] as ProjectManifest;
  const { entities = [], relations = [] } = (files[manifest.entries.schema] ??
    {}) as Partial<EntitiesFile>;
  return { entities, relations };
}
