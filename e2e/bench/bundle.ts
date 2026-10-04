import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let bundle: Promise<string> | undefined;

/**
 * The bench page and the data engine it runs, as one script for a browser. Built from the sources
 * when the spec starts, in memory: nothing of it is in a production build, and the engine that is
 * measured is the one in `packages/data-repository`, not a copy.
 */
export function benchBundle(): Promise<string> {
  bundle ??= build({
    entryPoints: [resolve(here, 'bench-page.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  }).then((result) => {
    const file = result.outputFiles[0];
    if (file === undefined) throw new Error('the bench page produced no script');
    return file.text;
  });
  return bundle;
}
