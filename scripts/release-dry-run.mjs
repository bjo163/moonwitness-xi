import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseWorkflow = path.join(repositoryRoot, '.github/workflows/release.yml');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function parseArguments(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--date') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--date requires YYYY-MM-DD.');
      options.set(argument, value);
      index += 1;
    } else if (argument === '--output') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--output requires a file path.');
      options.set(argument, value);
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function plannedAssets(version, sourceSha) {
  return [
    { name: `ghcr.io/<owner>/<repository>:${version}`, kind: 'api-image', immutable: true },
    {
      name: `ghcr.io/<owner>/<repository>-board:${version}`,
      kind: 'board-image',
      immutable: true,
    },
    { name: 'GitHub Release notes', kind: 'release-notes', immutable: true },
    { name: 'release-artifacts.sha256', kind: 'artifact-checksum', immutable: true },
    {
      name: `release-images-${sourceSha}`,
      kind: 'verified-image-transport',
      immutable: true,
    },
  ];
}

function requiredGates(sourceSha) {
  return [
    { id: 'source-main-ancestry', status: 'not-run', sourceSha },
    { id: 'exact-main-ci-gate', status: 'not-run', sourceSha },
    { id: 'workspace-release-version', status: 'not-run', command: 'pnpm release:check' },
    { id: 'lint', status: 'not-run', command: 'pnpm lint' },
    { id: 'format', status: 'not-run', command: 'pnpm format:check' },
    { id: 'typecheck', status: 'not-run', command: 'pnpm typecheck' },
    { id: 'generated-docs', status: 'not-run', command: 'pnpm docs:check' },
    { id: 'board-lint', status: 'not-run', command: 'pnpm --filter @moonwitness/board lint' },
    { id: 'unit', status: 'not-run', command: 'pnpm test:unit' },
    { id: 'postgres-integration', status: 'not-run', command: 'pnpm test:integration' },
    { id: 'container-smoke', status: 'not-run', command: 'bash scripts/smoke-containers.sh' },
    { id: 'critical-container-vulnerabilities', status: 'not-run', scanner: 'Trivy CRITICAL' },
  ];
}

export function buildReleaseDryRunReport(
  preparation,
  currentFiles,
  gates = requiredGates(preparation.source.headSha)
) {
  const versionDiff = [];
  const fileChanges = [];
  let changelogSection = null;

  for (const file of preparation.files ?? []) {
    const before = currentFiles.get(file.path) ?? '';
    fileChanges.push({
      path: file.path,
      beforeSha256: sha256(before),
      afterSha256: sha256(file.contents),
    });
    if (file.path.endsWith('package.json')) {
      const previous = JSON.parse(before);
      const next = JSON.parse(file.contents);
      if (previous.version !== next.version)
        versionDiff.push({ path: file.path, from: previous.version, to: next.version });
    }
    if (file.path === 'CHANGELOG.md') {
      const header = `## [${preparation.version}] - `;
      const start = file.contents.indexOf(header);
      if (start >= 0) {
        const nextHeader = file.contents.indexOf('\n## [', start + header.length);
        changelogSection = file.contents.slice(start, nextHeader < 0 ? undefined : nextHeader);
      }
    }
  }

  return {
    schemaVersion: 1,
    kind: 'moonwitness-release-dry-run',
    generatedAt: new Date().toISOString(),
    source: preparation.source,
    status: preparation.status,
    version: preparation.version ?? null,
    releaseInputSha: preparation.releaseInputSha ?? null,
    versionDiff,
    changelogDiff: changelogSection,
    files: fileChanges,
    assets: preparation.version
      ? plannedAssets(preparation.version, preparation.source.headSha)
      : [],
    gates,
    writesPerformed: false,
    registryWritesPerformed: false,
    githubReleaseCreated: false,
    pagesPublished: false,
    deploymentPerformed: false,
  };
}

async function run(options) {
  const date = options.get('--date') ?? new Date().toISOString().slice(0, 10);
  const preparationOutput = execFileSync(
    process.execPath,
    [path.join(repositoryRoot, 'scripts/prepare-release.mjs'), '--include-content', '--date', date],
    { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const preparation = JSON.parse(preparationOutput);
  const currentFiles = new Map(
    await Promise.all(
      (preparation.files ?? []).map(async (file) => [
        file.path,
        await readFile(path.join(repositoryRoot, file.path), 'utf8'),
      ])
    )
  );
  const workflow = await readFile(releaseWorkflow, 'utf8');
  const report = buildReleaseDryRunReport(preparation, currentFiles);
  report.releaseWorkflowSha256 = sha256(workflow);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = options.get('--output');
  if (outputPath) await writeFile(path.resolve(outputPath), output, { flag: 'wx' });
  else process.stdout.write(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
