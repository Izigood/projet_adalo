import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runCli } from './ci-checks.ts';

const ci = process.env['CI'];

process.exitCode = runCli(process.argv.slice(2), {
  isCi: ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0',
  hasBinary: (name) => {
    const probe = spawnSync(name, ['--version'], { stdio: 'ignore' });
    return probe.error === undefined && probe.status === 0;
  },
  spawn: (command, args) => spawnSync(command, [...args], { stdio: 'inherit' }).status ?? 1,
  readFile: (path) => readFileSync(path, 'utf8'),
  log: (line) => console.log(line),
});
