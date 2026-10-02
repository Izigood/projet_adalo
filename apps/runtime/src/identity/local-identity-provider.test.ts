import { isUuidV7 } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import { createLocalIdentityProvider } from './local-identity-provider.js';

describe('local identity provider', () => {
  it('is a local provider with a named profile and a UUID v7 identifier', async () => {
    const provider = createLocalIdentityProvider();
    const user = await provider.current();
    expect(provider.kind).toBe('local');
    expect(user?.displayName).toBe('Utilisateur local');
    expect(isUuidV7(user?.id ?? '')).toBe(true);
  });

  it('has no role by default and carries the roles and the locale it is given', async () => {
    expect((await createLocalIdentityProvider().current())?.roles).toEqual([]);
    const user = await createLocalIdentityProvider({
      roles: ['admin'],
      locale: 'en-GB',
      displayName: 'Sam',
    }).current();
    expect(user).toMatchObject({ roles: ['admin'], locale: 'en-GB', displayName: 'Sam' });
  });

  it('answers with the same user every time', async () => {
    const provider = createLocalIdentityProvider();
    expect(await provider.current()).toBe(await provider.current());
    expect(await provider.signIn()).toBe(await provider.current());
  });

  it('signs out and in again', async () => {
    const provider = createLocalIdentityProvider({ roles: ['admin'] });
    await provider.signOut();
    expect(await provider.current()).toBeNull();
    expect((await provider.signIn()).roles).toEqual(['admin']);
    expect(await provider.current()).not.toBeNull();
  });

  it('does not share the roles array with its caller', async () => {
    const roles = ['admin'];
    const provider = createLocalIdentityProvider({ roles });
    roles.push('root');
    expect((await provider.current())?.roles).toEqual(['admin']);
  });
});
