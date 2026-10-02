import { newId } from '@acs/domain';
import type { IdentityProvider, RoleKey, UserContext } from '@acs/domain';

export type LocalIdentityOptions = {
  readonly displayName?: string;
  /** Roles of the local profile. None by default: a role guard refuses the page (ADR-0033). */
  readonly roles?: readonly RoleKey[];
  readonly locale?: string;
};

/**
 * The MVP adapter of the `IdentityProvider` port (EF-SEC-02): one named local profile, always
 * available, with no credential. It carries no security value (dossier 2.2, EF-SEC-03).
 */
export function createLocalIdentityProvider(options: LocalIdentityOptions = {}): IdentityProvider {
  const user: UserContext = {
    id: newId<'user'>(),
    displayName: options.displayName ?? 'Utilisateur local',
    roles: [...(options.roles ?? [])],
    attributes: {},
    locale: options.locale ?? 'fr-FR',
  };
  let signedIn = true;
  return {
    kind: 'local',
    current: () => Promise.resolve(signedIn ? user : null),
    signIn: () => {
      signedIn = true;
      return Promise.resolve(user);
    },
    signOut: () => {
      signedIn = false;
      return Promise.resolve();
    },
  };
}
