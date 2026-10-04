import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const bundles = new Map<string, Promise<string>>();

/**
 * A page of the data engine and the engine it runs, as one script for a browser. Built from the
 * sources when the spec starts, in memory: nothing of it is in a production build, and the engine
 * that is measured is the one in `packages/data-repository`, not a copy.
 */
function bundleOf(page: string): Promise<string> {
  const known = bundles.get(page);
  if (known !== undefined) return known;
  const made = build({
    entryPoints: [resolve(here, page)],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  }).then((result) => {
    const file = result.outputFiles[0];
    if (file === undefined) throw new Error(`${page} produced no script`);
    return file.text;
  });
  bundles.set(page, made);
  return made;
}

/** The volume bench (10 000 records, timed queries). */
export const benchBundle = (): Promise<string> => bundleOf('bench-page.ts');
/** The functional scenario of the engine. */
export const engineBundle = (): Promise<string> => bundleOf('engine-page.ts');
