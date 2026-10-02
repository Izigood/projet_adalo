import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Loads the real entry point with a given command line and returns the exit code it set. */
async function runBin(args: string[]): Promise<typeof process.exitCode> {
  const argv = process.argv;
  process.argv = ['node', 'bin.ts', ...args];
  try {
    vi.resetModules();
    await import('./bin.ts');
    return process.exitCode;
  } finally {
    process.argv = argv;
    process.exitCode = undefined;
  }
}

describe('bin entry point', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ci-checks-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('exits 0 on a valid SBOM file', async () => {
    const file = join(dir, 'ok.cdx.json');
    writeFileSync(
      file,
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.7',
        components: [{ name: 'a', version: '1' }],
      }),
    );
    expect(await runBin(['sbom-check', file])).toBe(0);
  });

  it('exits 1 on a corrupted SBOM file', async () => {
    const file = join(dir, 'bad.cdx.json');
    writeFileSync(file, '{"bomFormat":"CycloneDX"}');
    expect(await runBin(['sbom-check', file])).toBe(1);
  });

  it('exits 2 and prints usage without arguments', async () => {
    expect(await runBin([])).toBe(2);
  });

  describe('osv with osv-scanner absent from PATH', () => {
    const saved = { PATH: process.env['PATH'], CI: process.env['CI'] };

    beforeEach(() => {
      process.env['PATH'] = '';
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    it('warns and exits 0 outside CI', async () => {
      delete process.env['CI'];
      expect(await runBin(['osv', 'pnpm-lock.yaml'])).toBe(0);
    });

    it('fails with exit 1 in CI', async () => {
      process.env['CI'] = 'true';
      expect(await runBin(['osv', 'pnpm-lock.yaml'])).toBe(1);
    });

    it.each(['false', '0', ''])('does not treat CI=%j as a CI run', async (value) => {
      process.env['CI'] = value;
      expect(await runBin(['osv', 'pnpm-lock.yaml'])).toBe(0);
    });
  });
});
