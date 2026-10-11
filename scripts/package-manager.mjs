import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { env, execPath, platform } from 'node:process';

/** Resolve the pnpm executable for both direct CLI use and CI shell invocations. */
export function resolvePackageManager(environment = env, operatingSystem = platform) {
  const cli = environment.npm_execpath;
  if (typeof cli === 'string' && cli.length > 0 && existsSync(cli)) {
    return { command: execPath, prefixArgs: [cli], shell: false };
  }

  const command = operatingSystem === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const probe = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    ...(operatingSystem === 'win32' ? { shell: true } : {}),
    windowsHide: true,
  });
  if (probe.status !== 0 || probe.error) return undefined;
  return { command, prefixArgs: [], shell: false };
}
