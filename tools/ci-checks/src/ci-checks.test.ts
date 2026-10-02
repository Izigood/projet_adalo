import { describe, expect, it, vi } from 'vitest';
import { osvDecision, runCli, sbomProblems } from './ci-checks.ts';
import type { Deps } from './ci-checks.ts';

const validBom = JSON.stringify({
  bomFormat: 'CycloneDX',
  specVersion: '1.7',
  components: [{ name: 'lit', version: '3.3.3' }],
});

function fakeDeps(overrides: Partial<Deps> = {}) {
  const log = vi.fn<(line: string) => void>();
  const spawn = vi.fn<(command: string, args: readonly string[]) => number>(() => 0);
  const deps: Deps = {
    isCi: false,
    hasBinary: () => true,
    spawn,
    readFile: () => validBom,
    log,
    ...overrides,
  };
  return { deps, log, spawn };
}

describe('osvDecision', () => {
  it('runs the scan whenever osv-scanner is installed, in CI or not', () => {
    expect(osvDecision({ binaryAvailable: true, ci: false })).toEqual({ action: 'run' });
    expect(osvDecision({ binaryAvailable: true, ci: true })).toEqual({ action: 'run' });
  });

  it('only warns locally when osv-scanner is missing', () => {
    const decision = osvDecision({ binaryAvailable: false, ci: false });
    expect(decision.action).toBe('skip');
    expect('message' in decision && decision.message).toMatch(/WARNING.*mandatory in CI/);
  });

  it('fails in CI when osv-scanner is missing', () => {
    const decision = osvDecision({ binaryAvailable: false, ci: true });
    expect(decision.action).toBe('fail');
    expect('message' in decision && decision.message).toMatch(/cannot be skipped/);
  });
});

describe('sbomProblems', () => {
  it('accepts a CycloneDX document with versioned components', () => {
    expect(sbomProblems(validBom)).toEqual([]);
  });

  it('rejects text that is not JSON', () => {
    expect(sbomProblems('not json')).toEqual(['SBOM is not valid JSON']);
  });

  it('rejects another format and a missing spec version', () => {
    const problems = sbomProblems(
      JSON.stringify({ bomFormat: 'SPDX', components: [{ name: 'a', version: '1' }] }),
    );
    expect(problems).toContain('bomFormat is not "CycloneDX"');
    expect(problems).toContain('specVersion is missing');
  });

  it('rejects an SBOM without components (an empty bill proves nothing)', () => {
    expect(
      sbomProblems(JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.7', components: [] })),
    ).toEqual(['SBOM lists no component']);
    expect(sbomProblems(JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.7' }))).toEqual([
      'SBOM lists no component',
    ]);
  });

  it('counts components that lack a name or a version', () => {
    const bom = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.7',
      components: [{ name: 'lit', version: '3.3.3' }, { name: 'ghost' }, { version: '1' }],
    });
    expect(sbomProblems(bom)).toEqual(['2 component(s) without name or version']);
  });
});

describe('runCli osv', () => {
  it('runs osv-scanner on the lockfile and returns its exit status', () => {
    const clean = fakeDeps();
    expect(runCli(['osv', 'pnpm-lock.yaml'], clean.deps)).toBe(0);
    expect(clean.spawn).toHaveBeenCalledWith('osv-scanner', [
      'scan',
      'source',
      '--lockfile',
      'pnpm-lock.yaml',
    ]);

    const vulnerable = fakeDeps({ spawn: () => 1 });
    expect(runCli(['osv', 'pnpm-lock.yaml'], vulnerable.deps)).toBe(1);
  });

  it('skips with a warning locally when the binary is missing', () => {
    const { deps, log, spawn } = fakeDeps({ hasBinary: () => false });
    expect(runCli(['osv', 'pnpm-lock.yaml'], deps)).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
  });

  it('fails in CI when the binary is missing', () => {
    const { deps, log, spawn } = fakeDeps({ hasBinary: () => false, isCi: true });
    expect(runCli(['osv', 'pnpm-lock.yaml'], deps)).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cannot be skipped'));
  });
});

describe('runCli sbom-check', () => {
  it('passes a valid SBOM and fails an invalid one, reporting each problem', () => {
    expect(runCli(['sbom-check', 'sbom.cdx.json'], fakeDeps().deps)).toBe(0);

    const { deps, log } = fakeDeps({ readFile: () => '{}' });
    expect(runCli(['sbom-check', 'sbom.cdx.json'], deps)).toBe(1);
    expect(log).toHaveBeenCalledWith('SBOM check failed: bomFormat is not "CycloneDX"');
  });
});

describe('runCli usage', () => {
  it('returns 2 with usage for a missing target or an unknown command', () => {
    const missing = fakeDeps();
    expect(runCli(['osv'], missing.deps)).toBe(2);
    expect(missing.log).toHaveBeenCalledWith(expect.stringContaining('usage:'));
    expect(runCli(['unknown', 'x'], fakeDeps().deps)).toBe(2);
    expect(runCli([], fakeDeps().deps)).toBe(2);
  });
});
