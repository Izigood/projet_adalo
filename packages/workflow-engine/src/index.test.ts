import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@acs/workflow-engine', () => {
  it('exposes its package name from the public entry point', () => {
    expect(PACKAGE_NAME).toBe('@acs/workflow-engine');
  });
});
