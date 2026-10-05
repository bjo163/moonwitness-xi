import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { COMPATIBILITY_REVIEW_GATES } from './dependency-update-plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = /^(?:\^|~|>=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

function parseVersion(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a semantic version.`);
  const match = VERSION.exec(value.trim());
  if (!match) throw new Error(`${label} must be a semantic version.`);
  return match[1];
}

function command(executable, args, cwd, capture = false) {
  try {
    const output = execFileSync(executable, args, {
      cwd,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    return capture ? output.trim() : '';
  } catch (error) {
    if (capture && error?.stderr) {
      throw new Error(`${executable} ${args[0]} failed: ${String(error.stderr).trim()}`, {
        cause: error,
      });
    }
    throw error;
  }
}

function git(cwd, ...args) {
  return command('git', args, cwd, true);
}

async function manifestAt(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function workspaceManifestPaths(root) {
  const patterns = (await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'))
    .split(/\r?\n/u)
    .map((line) => /^\s*-\s*['"]?([^'"#]+)['"]?\s*$/u.exec(line)?.[1]?.trim())
    .filter((pattern) => pattern?.endsWith('/*'));
  const manifests = [];
  for (const pattern of patterns) {
    const directory = join(root, pattern.slice(0, -2));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(directory, entry.name, 'package.json'));
    }
  }
  return manifests;
}

async function locateDependency(root, packageName) {
  const rootManifestPath = join(root, 'package.json');
  const declarations = [];
  for (const manifestPath of [rootManifestPath, ...(await workspaceManifestPaths(root))]) {
    const manifest = await manifestAt(manifestPath);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (Object.hasOwn(manifest[section] ?? {}, packageName)) {
        declarations.push({ manifestPath, section, current: manifest[section][packageName] });
      }
    }
  }
  if (declarations.length === 0) {
    throw new Error(`Dependency ${packageName} is not declared in a workspace manifest.`);
  }
  return declarations;
}

export async function applyCandidate({
  packageName,
  version,
  sourceSha,
  expectedSourceSha,
  root = ROOT,
  execute = command,
}) {
  if (
    typeof packageName !== 'string' ||
    !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(packageName)
  ) {
    throw new Error('Invalid package name.');
  }
  const exactVersion = parseVersion(version, 'Version');
  if (exactVersion.includes('-')) {
    throw new Error('Prerelease dependency versions are report-only and cannot be auto-applied.');
  }
  if (!/^[0-9a-f]{40}$/i.test(sourceSha) || sourceSha !== expectedSourceSha) {
    throw new Error('Candidate source SHA must exactly match the expected source SHA.');
  }
  if (git(root, 'rev-parse', 'HEAD') !== sourceSha) {
    throw new Error('Checkout HEAD does not match the candidate source SHA.');
  }
  if (git(root, 'status', '--porcelain', '--untracked-files=all')) {
    throw new Error('Candidate checkout must be clean before dependency mutation.');
  }

  const declarations = await locateDependency(root, packageName);
  for (const declaration of declarations) {
    const oldVersion = parseVersion(declaration.current, 'Current dependency range');
    if (Number(oldVersion.split('.')[0]) !== Number(exactVersion.split('.')[0])) {
      throw new Error(
        'Major dependency updates are report-only and cannot be applied by this executor.'
      );
    }
  }
  const changedDeclarations = declarations.filter(
    (declaration) => parseVersion(declaration.current, 'Current dependency range') !== exactVersion
  );
  if (changedDeclarations.length === 0) {
    throw new Error(`${packageName} is already pinned to ${exactVersion}.`);
  }

  for (const declaration of changedDeclarations) {
    const manifestRelative = relative(root, declaration.manifestPath).replaceAll('\\', '/');
    const addDirectory = relative(root, dirname(declaration.manifestPath)) || '.';
    const addArgs = [
      '--dir',
      join(root, addDirectory),
      'add',
      '--save-exact',
      '--ignore-scripts',
      `${packageName}@${exactVersion}`,
    ];
    if (manifestRelative === 'package.json') addArgs.push('--workspace-root');
    if (declaration.section === 'devDependencies') addArgs.push('--save-dev');
    if (declaration.section === 'optionalDependencies') addArgs.push('--save-optional');
    execute('pnpm', addArgs, root);
  }
  execute('pnpm', ['--dir', root, 'install', '--lockfile-only', '--ignore-scripts'], root);

  const manifestRelatives = [];
  for (const declaration of changedDeclarations) {
    const manifestAfter = await manifestAt(declaration.manifestPath);
    if (manifestAfter[declaration.section][packageName] !== exactVersion) {
      throw new Error(`pnpm did not save ${packageName} at the requested exact version.`);
    }
    manifestRelatives.push(relative(root, declaration.manifestPath).replaceAll('\\', '/'));
  }
  const changedFiles = [
    ...git(root, 'diff', '--name-only').split('\n').filter(Boolean),
    ...git(root, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean),
  ]
    .filter((path) => !path.startsWith('node_modules/'))
    .sort();
  const allowedFiles = [...manifestRelatives, 'pnpm-lock.yaml'].sort();
  if (
    changedFiles.length !== allowedFiles.length ||
    changedFiles.some((path, index) => path !== allowedFiles[index])
  ) {
    throw new Error(`Candidate changed unexpected files: ${changedFiles.join(', ') || '(none)'}.`);
  }
  return {
    packageName,
    current: [...new Set(declarations.map(({ current }) => current))],
    version: exactVersion,
    sourceSha,
    changedFiles,
  };
}

export async function runCandidate({
  packageName,
  version,
  sourceSha,
  expectedSourceSha,
  root = ROOT,
  execute = command,
}) {
  const result = await applyCandidate({
    packageName,
    version,
    sourceSha,
    expectedSourceSha,
    root,
    execute,
  });
  execute('pnpm', ['--dir', root, 'install', '--frozen-lockfile'], root);
  execute(
    'pnpm',
    ['--dir', root, 'exec', 'playwright', 'install', '--with-deps', 'chromium'],
    root
  );
  for (const gate of COMPATIBILITY_REVIEW_GATES) {
    execute('pnpm', ['--dir', root, ...gate.split(' ').slice(1)], root);
  }
  execute('pnpm', ['--dir', root, '--filter', '@moonwitness/board', 'lint'], root);
  execute('bash', ['scripts/smoke-containers.sh'], root);
  return result;
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || values.has(key)) {
      throw new Error(
        'Usage: dependency-candidate --package <name> --version <exact-version> --source-sha <sha> --expected-source-sha <sha>'
      );
    }
    values.set(key, value);
  }
  const options = {
    packageName: values.get('--package'),
    version: values.get('--version'),
    sourceSha: values.get('--source-sha'),
    expectedSourceSha: values.get('--expected-source-sha'),
    root: values.get('--root') ?? ROOT,
  };
  if (
    [options.packageName, options.version, options.sourceSha, options.expectedSourceSha].some(
      (value) => value === undefined
    )
  ) {
    throw new Error(
      'Usage: dependency-candidate --package <name> --version <exact-version> --source-sha <sha> --expected-source-sha <sha>'
    );
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runCandidate(options);
    await writeFile(
      join(options.root ?? ROOT, 'dependency-candidate-result.json'),
      `${JSON.stringify(result, null, 2)}\n`,
      { flag: 'wx' }
    );
    process.stdout.write(
      `Candidate ${result.packageName} ${result.current} -> ${result.version} passed full verification.\n`
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
