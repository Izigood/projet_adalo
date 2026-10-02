/**
 * Supply-chain steps of `pnpm verify` (dossier 9.5): osv-scanner and the CycloneDX SBOM check.
 * Run directly by Node (type stripping), hence the explicit `.ts` extensions in this package.
 */

export type Deps = {
  readonly isCi: boolean;
  readonly hasBinary: (name: string) => boolean;
  /** Runs a command with inherited output and returns its exit status. */
  readonly spawn: (command: string, args: readonly string[]) => number;
  readonly readFile: (path: string) => string;
  readonly log: (line: string) => void;
};

export type OsvDecision =
  | { readonly action: 'run' }
  | { readonly action: 'skip'; readonly message: string }
  | { readonly action: 'fail'; readonly message: string };

/**
 * osv-scanner is an external binary. Locally a missing binary only warns, so contributors can run
 * `pnpm verify` without it; in CI a missing binary fails, so the scan can never be skipped silently.
 */
export function osvDecision(input: { binaryAvailable: boolean; ci: boolean }): OsvDecision {
  if (input.binaryAvailable) return { action: 'run' };
  if (input.ci) {
    return {
      action: 'fail',
      message:
        'osv-scanner is not installed and CI is set: the vulnerability scan cannot be skipped.',
    };
  }
  return {
    action: 'skip',
    message:
      'WARNING: osv-scanner is not installed, vulnerability scan skipped (it is mandatory in CI).',
  };
}

type Bom = {
  bomFormat?: unknown;
  specVersion?: unknown;
  components?: unknown;
};

/** Problems found in a CycloneDX SBOM; an empty list means the document is usable. */
export function sbomProblems(raw: string): string[] {
  let bom: Bom;
  try {
    bom = JSON.parse(raw) as Bom;
  } catch {
    return ['SBOM is not valid JSON'];
  }
  const problems: string[] = [];
  if (bom.bomFormat !== 'CycloneDX') problems.push('bomFormat is not "CycloneDX"');
  if (typeof bom.specVersion !== 'string') problems.push('specVersion is missing');
  if (!Array.isArray(bom.components) || bom.components.length === 0) {
    problems.push('SBOM lists no component');
    return problems;
  }
  const unnamed = (bom.components as { name?: unknown; version?: unknown }[]).filter(
    (c) => typeof c.name !== 'string' || typeof c.version !== 'string',
  ).length;
  if (unnamed > 0) problems.push(`${unnamed} component(s) without name or version`);
  return problems;
}

const USAGE = 'usage: ci-checks osv <lockfile> | ci-checks sbom-check <file>';

export function runCli(args: readonly string[], deps: Deps): number {
  const [command, target] = args;
  if (target === undefined) {
    deps.log(USAGE);
    return 2;
  }
  if (command === 'osv') {
    const decision = osvDecision({ binaryAvailable: deps.hasBinary('osv-scanner'), ci: deps.isCi });
    if (decision.action === 'run') {
      return deps.spawn('osv-scanner', ['scan', 'source', '--lockfile', target]);
    }
    deps.log(decision.message);
    return decision.action === 'fail' ? 1 : 0;
  }
  if (command === 'sbom-check') {
    const problems = sbomProblems(deps.readFile(target));
    for (const problem of problems) deps.log(`SBOM check failed: ${problem}`);
    return problems.length === 0 ? 0 : 1;
  }
  deps.log(USAGE);
  return 2;
}
