import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withScratchProject } from './run-gate.js';

/**
 * REC-10: negative controls of the supply-chain gate (osv-scanner and SBOM, dossier 9.5), run as
 * real processes. The scanner binary is made unreachable by emptying PATH.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bin = resolve(repoRoot, 'tools/ci-checks/src/bin.ts');
const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

type Env = Record<string, string | undefined>;

function cli(args: string[], env: Env) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PATH: '', ...env },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

const noCi: Env = { CI: undefined };
const goodSbom = JSON.stringify({
  bomFormat: 'CycloneDX',
  specVersion: '1.7',
  components: [{ name: 'lit', version: '3.3.3' }],
});

describe('supply-chain gate (REC-10)', () => {
  it('is part of pnpm verify and chains the scan and the SBOM check', () => {
    const verify = (manifest.scripts['verify'] ?? '').split('&&').map((step) => step.trim());
    expect(verify).toContain('pnpm security');
    expect(manifest.scripts['security']).toBe('pnpm security:osv && pnpm security:sbom');
    expect(manifest.scripts['security:sbom']).toContain('sbom-check');
  });

  it('fails in CI when osv-scanner is missing, so the scan cannot be skipped silently', () => {
    const run = cli(['osv', 'pnpm-lock.yaml'], { CI: 'true' });
    expect(run.status).toBe(1);
    expect(run.output).toContain('cannot be skipped');
  });

  it('only warns outside CI when osv-scanner is missing', () => {
    const run = cli(['osv', 'pnpm-lock.yaml'], noCi);
    expect(run.status).toBe(0);
    expect(run.output).toContain('WARNING');
  });

  it('accepts a valid SBOM and rejects a corrupted or empty one', () => {
    withScratchProject(
      {
        'good.cdx.json': goodSbom,
        'truncated.cdx.json': goodSbom.slice(0, 40),
        'empty.cdx.json': JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.7',
          components: [],
        }),
      },
      (dir) => {
        expect(cli(['sbom-check', join(dir, 'good.cdx.json')], noCi).status).toBe(0);
        const truncated = cli(['sbom-check', join(dir, 'truncated.cdx.json')], noCi);
        expect(truncated.status).toBe(1);
        expect(truncated.output).toContain('not valid JSON');
        const empty = cli(['sbom-check', join(dir, 'empty.cdx.json')], noCi);
        expect(empty.status).toBe(1);
        expect(empty.output).toContain('no component');
      },
    );
  });
});
