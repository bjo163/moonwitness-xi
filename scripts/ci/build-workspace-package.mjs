import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { summarizeTypeScriptDiagnostics } from './typescript-diagnostics.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageName = process.argv[2];

if (!packageName || !/^@moonwitness\/[a-z0-9-]+$/u.test(packageName)) {
  throw new Error('Expected a workspace package name under @moonwitness/.');
}

const packageDirectory = packageName.slice('@moonwitness/'.length);
const packageRoot = path.join(repositoryRoot, 'packages', packageDirectory);
const packageManifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
if (packageManifest.name !== packageName || packageManifest.scripts?.build !== 'tsc') {
  throw new Error(`Package ${packageName} must exist and expose the tsc build script.`);
}

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
  packageManager,
  ['--filter', packageName, 'exec', 'tsc', '--pretty', 'false'],
  { cwd: repositoryRoot, encoding: 'utf8', shell: process.platform === 'win32' }
);
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

if (result.status === 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(0);
}

const diagnostics = summarizeTypeScriptDiagnostics(output, repositoryRoot, packageRoot);

if (diagnostics.length === 0) {
  const code = output.match(/^error (TS\d+):/mu)?.[1];
  const title = code ? `TypeScript build failed (${code})` : 'TypeScript build failed';
  process.stdout.write(
    `::error title=${title}::Compiler exited ${result.status ?? 1}; inspect the private runner log.\n`
  );
} else {
  for (const diagnostic of diagnostics) {
    const location = diagnostic.path
      ? `file=${diagnostic.path},line=${diagnostic.line},col=${diagnostic.column},`
      : '';
    process.stdout.write(
      `::error ${location}title=TypeScript ${diagnostic.code}::Review the compiler diagnostic in the private runner log.\n`
    );
  }
  process.stdout.write(
    `TypeScript reported ${diagnostics.length} diagnostic(s); details remain in the runner log.\n`
  );
}

process.exit(result.status ?? 1);
