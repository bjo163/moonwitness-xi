import { execFileSync } from 'node:child_process';
import { env, execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

export default async function globalSetup(): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const packageManagerCli = env.npm_execpath;

  if (!packageManagerCli) {
    throw new Error('Cannot resolve pnpm CLI for E2E workspace build.');
  }

  execFileSync(execPath, [packageManagerCli, '--filter', '@moonwitness/api...', 'build'], {
    cwd: repositoryRoot,
    env,
    stdio: 'inherit',
  });
}
