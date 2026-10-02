import { describe, expect, it } from 'vitest';
import { asId, isUuidV7 } from './index.js';

describe('Id', () => {
  const valid = '018f3e2a-7b1c-7d4e-8a3f-0123456789ab';

  it('accepts a canonical UUID v7', () => {
    expect(isUuidV7(valid)).toBe(true);
    expect(asId<'entity'>(valid)).toBe(valid);
  });

  it('rejects other UUID versions, bad variants, labels and uppercase', () => {
    expect(isUuidV7('018f3e2a-7b1c-4d4e-8a3f-0123456789ab')).toBe(false);
    expect(isUuidV7('018f3e2a-7b1c-7d4e-0a3f-0123456789ab')).toBe(false);
    expect(isUuidV7('customer')).toBe(false);
    expect(isUuidV7(valid.toUpperCase())).toBe(false);
    expect(asId('customer')).toBeUndefined();
  });
});
