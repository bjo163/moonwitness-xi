import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { env, execPath, platform } from 'node:process';

/** Resolve the pnpm executable for both direct CLI use and CI shell invocations. */
export function resolvePackageManager(environment = env, operatingSystem = platform) {
  const cli = environment.npm_execpath;
  if (typeof cli === 'string' && cli.length > 0 && existsSync(cli)) {
    return { command: execPath, prefixArgs: [cli], shell: false };
  }

  let command = 'pnpm';
  let prefixArgs = [];
  if (operatingSystem === 'win32') {
    const locatedShim = spawnSync('where.exe', ['pnpm.cmd'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const shimPath = locatedShim.status === 0 ? locatedShim.stdout.trim().split(/\r?\n/u)[0] : '';
    const pnpmCli = shimPath
      ? ['mjs', 'cjs']
          .map((extension) =>
            join(dirname(shimPath), 'node_modules', 'pnpm', 'bin', `pnpm.${extension}`)
          )
          .find((path) => existsSync(path))
      : undefined;
    if (!pnpmCli) return undefined;
    command = execPath;
    prefixArgs = [pnpmCli];
  }
  const probe = spawnSync(command, [...prefixArgs, '--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (probe.status !== 0 || probe.error) return undefined;
  return { command, prefixArgs, shell: false };
}
