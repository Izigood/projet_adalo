import { describe, expect, it } from 'vitest';
import { hasRole } from './identity.js';
import type { IdentityProvider, UserContext } from './identity.js';

const user = (roles: readonly string[]): UserContext => ({
  id: 'u1',
  displayName: 'Utilisateur local',
  roles,
  attributes: {},
  locale: 'fr-FR',
});

describe('hasRole', () => {
  it('is true only for a role the user holds', () => {
    expect(hasRole(user(['admin', 'reader']), 'reader')).toBe(true);
    expect(hasRole(user(['admin']), 'reader')).toBe(false);
  });

  it('matches the whole key, not a prefix or a substring', () => {
    expect(hasRole(user(['administrator']), 'admin')).toBe(false);
    expect(hasRole(user(['admin']), 'administrator')).toBe(false);
  });

  it('gives no role to a missing user or a user without roles', () => {
    expect(hasRole(null, 'admin')).toBe(false);
    expect(hasRole(user([]), 'admin')).toBe(false);
  });
});

describe('IdentityProvider port', () => {
  it('can be implemented by an adapter with no other dependency', async () => {
    const adapter: IdentityProvider = {
      kind: 'local',
      current: () => Promise.resolve(user([])),
      signIn: () => Promise.resolve(user([])),
      signOut: () => Promise.resolve(),
    };
    expect((await adapter.current())?.displayName).toBe('Utilisateur local');
  });
});
