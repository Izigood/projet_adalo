import { describe, expect, it } from 'vitest';
import { requestPersistence } from './persistence.js';

function storage(options: { persisted: boolean; grants: boolean | 'throws' }) {
  const calls = { persist: 0 };
  return {
    calls,
    manager: {
      persisted: () => Promise.resolve(options.persisted),
      persist: () => {
        calls.persist += 1;
        return options.grants === 'throws'
          ? Promise.reject(new Error('refused'))
          : Promise.resolve(options.grants);
      },
    },
  };
}

describe('requestPersistence (REC-01)', () => {
  it('asks, and says persistent when the browser agrees', async () => {
    const { manager, calls } = storage({ persisted: false, grants: true });
    expect(await requestPersistence(manager)).toBe('persistent');
    expect(calls.persist).toBe(1);
  });

  it('says best-effort when the browser refuses', async () => {
    expect(await requestPersistence(storage({ persisted: false, grants: false }).manager)).toBe(
      'best-effort',
    );
  });

  it('does not ask again when the storage is already persistent', async () => {
    const { manager, calls } = storage({ persisted: true, grants: false });
    expect(await requestPersistence(manager)).toBe('persistent');
    expect(calls.persist).toBe(0);
  });

  it('never throws: a failure leaves the storage best-effort', async () => {
    expect(await requestPersistence(storage({ persisted: false, grants: 'throws' }).manager)).toBe(
      'best-effort',
    );
  });

  it('says unsupported when there is nothing to ask', async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported');
    expect(await requestPersistence({})).toBe('unsupported');
  });
});
