import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { argv, cwd, env, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const requiredProjects = ['quality', 'integration', 'browser', 'containers', 'automation'];
const fullScopeFiles = new Set([
  '.github',
  'scripts',
  'package.json',
  '.gitignore',
  '.node-version',
  '.npmrc',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'eslint.config.js',
  'prettier.config.js',
  '.prettierrc',
  '.prettierrc.json',
  'vitest.config.ts',
  'Dockerfile',
  'docker-compose.production.yml',
]);

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    stderr.write(
      `git ${args[0]} could not compare the requested revisions; selecting full scope.\n`
    );
    if (result.stderr) stderr.write(result.stderr);
    return null;
  }
  return result.stdout;
}

export function expandWorkspaceDependencies(changedNames, projects) {
  const affected = new Set(changedNames);
  let changed = true;
  while (changed) {
    changed = false;
    for (const project of projects) {
      if (affected.has(project.name)) continue;
      if (project.dependencies.some((dependency) => affected.has(dependency))) {
        affected.add(project.name);
        changed = true;
      }
    }
  }
  return affected;
}

export function ciProjectsForAffectedPackages(affectedPackages) {
  const affected = new Set(affectedPackages);
  const projects = new Set(['automation']);
  if (affected.has('@moonwitness/board')) {
    projects.add('quality');
    projects.add('browser');
    projects.add('containers');
  }
  if (affected.has('@moonwitness/api')) {
    projects.add('integration');
    projects.add('containers');
  }
  if ([...affected].some((name) => name !== '@moonwitness/board' && name !== '@moonwitness/api')) {
    for (const project of ['quality', 'integration', 'browser', 'containers']) {
      projects.add(project);
    }
  }
  return [...projects];
}

async function writePlan(result, jsonOutput) {
  const projects = result.projects;
  if (env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(
      env.GITHUB_OUTPUT,
      `projects=${JSON.stringify(projects)}\nplan=${JSON.stringify(result)}\n`
    );
  }
  stdout.write(jsonOutput ? JSON.stringify(result) : projects.join('\n'));
}

async function projectDependencies(project) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(project.path, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter(([name, version]) => name.startsWith('@moonwitness/') && version === 'workspace:*')
    .map(([name]) => name);
}

function readWorkspaceProjects() {
  const result = spawnSync('pnpm', ['list', '--recursive', '--depth', '-1', '--json'], {
    encoding: 'utf8',
  });
  if (result.status === 0) return JSON.parse(result.stdout);
  const fallback = spawnSync('pnpm.cmd', ['list', '--recursive', '--depth', '-1', '--json'], {
    encoding: 'utf8',
    shell: true,
  });
  if (fallback.status !== 0) throw new Error('pnpm workspace graph unavailable');
  return JSON.parse(fallback.stdout);
}

async function main() {
  const base = argv[2] ?? env.AFFECTED_BASE_SHA;
  const head = argv[3] ?? env.GITHUB_SHA ?? 'HEAD';
  const jsonOutput = argv.includes('--json');
  let workspaceProjects;
  try {
    workspaceProjects = readWorkspaceProjects()
      .filter((project) => project.name !== 'moonwitness-monorepo')
      .map(async (project) => ({
        ...project,
        path: relative(cwd(), project.path).replaceAll('\\', '/'),
        dependencies: await projectDependencies(project),
      }));
    workspaceProjects = await Promise.all(workspaceProjects);
  } catch {
    stderr.write('Invalid pnpm workspace graph; using full CI scope.\n');
    await writePlan(
      { mode: 'full', reason: 'invalid-workspace-graph', projects: requiredProjects },
      jsonOutput
    );
    return;
  }

  const changedPaths = base ? git(['diff', '--name-only', base, head]) : null;
  if (changedPaths === null) {
    const reason = base ? 'base-sha-unavailable' : 'base-sha-missing';
    await writePlan({ mode: 'full', reason, projects: requiredProjects }, jsonOutput);
    return;
  }

  const changedFiles = changedPaths.split(/\r?\n/u).filter(Boolean);
  if (
    changedFiles.some((path) =>
      [...fullScopeFiles].some((root) => path === root || path.startsWith(`${root}/`))
    )
  ) {
    await writePlan(
      { mode: 'full', reason: 'shared-configuration', projects: requiredProjects },
      jsonOutput
    );
    return;
  }

  const changedNames = workspaceProjects
    .filter((project) => {
      return changedFiles.some((path) => path.startsWith(`${project.path}/`));
    })
    .map((project) => project.name);
  const affected = expandWorkspaceDependencies(changedNames, workspaceProjects);

  const ciProjects = ciProjectsForAffectedPackages(affected);
  const unclassifiedChanges = changedFiles.some(
    (path) =>
      !workspaceProjects.some((project) => path.startsWith(`${project.path}/`)) &&
      !path.startsWith('docs/') &&
      path !== 'README.md'
  );
  if (
    changedFiles.some((path) => path.startsWith('docs/') || path === 'README.md') ||
    unclassifiedChanges
  ) {
    if (!ciProjects.includes('quality')) ciProjects.push('quality');
  }

  const result = {
    mode: 'affected',
    reason: 'workspace-dependency-closure',
    changed: changedNames.sort(),
    affected: [...affected].sort(),
    projects: ciProjects,
  };
  await writePlan(result, jsonOutput);
}

const isDirectExecution =
  argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(argv[1]);
if (isDirectExecution) await main();
