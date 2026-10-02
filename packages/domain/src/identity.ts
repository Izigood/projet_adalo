/** Readable key of a role (RG-11), as listed in `UserContext.roles` and in role guards. */
export type RoleKey = string;

/** Who is using the application (dossier 7.4). */
export type UserContext = {
  readonly id: string;
  readonly displayName: string;
  readonly roles: readonly RoleKey[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly locale: string;
};

/**
 * Port of the user context (EF-SEC-02). The MVP has a local adapter; OIDC comes with the
 * Enterprise backend. Nothing outside an adapter reads the identity any other way.
 */
export interface IdentityProvider {
  current(): Promise<UserContext | null>;
  signIn(): Promise<UserContext>;
  signOut(): Promise<void>;
  readonly kind: 'local' | 'oidc';
}

/** True when the user holds the role. A missing user holds none. */
export function hasRole(user: UserContext | null, role: RoleKey): boolean {
  return user !== null && user.roles.includes(role);
}
