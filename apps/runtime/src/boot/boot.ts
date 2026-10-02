import { domainError, err, ok } from '@acs/domain';
import type { DomainError, IdentityProvider, Result, UserContext } from '@acs/domain';
import { openPackage, schemaForPath } from '@acs/project-schema';
import type { Page, PagesIndex, ProjectManifest, Theme } from '@acs/project-schema';
import type { ThemeOverrides } from '@acs/design-system';
import { createLocalIdentityProvider } from '../identity/local-identity-provider.js';
import { buildRouteTable } from '../router/route-table.js';
import type { RouteTable } from '../router/route-table.js';
import type { FileSource } from './file-source.js';
import { loadPackage } from './load-package.js';

/** Everything the interface needs once the package is read, migrated, validated and consistent. */
export type BootedProject = {
  readonly manifest: ProjectManifest;
  readonly theme: ThemeOverrides;
  readonly pages: ReadonlyMap<string, Page>;
  readonly table: RouteTable;
  readonly identity: IdentityProvider;
  readonly user: UserContext | null;
};

export type BootOptions = {
  readonly source: FileSource;
  /** Builds the identity provider for the locale of the project; the local one by default. */
  readonly identity?: (locale: string) => IdentityProvider;
};

/**
 * The boot pipeline (ADR-0033): read the package, migrate and validate it, check what the schema
 * cannot (the initial page, the routes, the default theme), then ask the identity provider who is
 * there. It touches neither the DOM nor the router: it only decides whether the project can run.
 */
export async function boot(options: BootOptions): Promise<Result<BootedProject, DomainError>> {
  const loaded = await loadPackage(options.source);
  if (!loaded.ok) return loaded;
  const opened = openPackage(loaded.value);
  if (!opened.ok) return opened;
  const files = opened.value;

  // The files are validated: these casts only name what the schemas guarantee.
  const manifest = files['project.json'] as ProjectManifest;
  const index = files[manifest.entries.pages] as PagesIndex;
  const pages = new Map<string, Page>();
  const themes: Theme[] = [];
  for (const [path, content] of Object.entries(files)) {
    const schema = schemaForPath(path);
    if (schema === 'Page') pages.set((content as Page).id, content as Page);
    if (schema === 'Theme') themes.push(content as Theme);
  }

  const theme = themes.find((candidate) => candidate.id === manifest.project.defaultThemeId);
  if (theme === undefined) {
    return err(
      domainError('MANIFEST_INVALID', 'the default theme is not in the package', {
        details: {
          issues: [
            {
              file: 'project.json',
              path: '/project/defaultThemeId',
              keyword: 'reference',
              message: 'no theme file has this id',
              params: {},
            },
          ],
        },
      }),
    );
  }

  const table = buildRouteTable(index, [...pages.values()]);
  if (!table.ok) return table;

  const identity = (options.identity ?? ((locale) => createLocalIdentityProvider({ locale })))(
    manifest.project.locale,
  );
  const user = await identity.current();
  return ok({
    manifest,
    theme: { tokens: theme.tokens, modes: theme.modes },
    pages,
    table: table.value,
    identity,
    user,
  });
}
