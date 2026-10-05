import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function parseVersion(version) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    version ?? ''
  );
  return match ? match.slice(1, 4).map(Number) : null;
}

export function classifyCompatibility(current, latest) {
  const from = parseVersion(current);
  const to = parseVersion(latest);
  if (!from || !to) return 'unknown';
  if (to[0] !== from[0]) return 'major';
  if (to[1] !== from[1]) return 'minor';
  if (to[2] !== from[2]) return 'patch';
  return 'same';
}

function groupFor(dependencyType) {
  if (dependencyType === 'githubAction') return 'actions';
  if (dependencyType === 'dependencies' || dependencyType === 'optionalDependencies') {
    return 'runtime';
  }
  if (dependencyType === 'devDependencies') return 'development';
  return null;
}

function repositoryUrl(manifest) {
  const repository = manifest?.repository;
  const candidate =
    (typeof repository === 'string' ? repository : repository?.url) ?? manifest?.homepage;
  if (typeof candidate !== 'string') return null;
  const normalized = candidate
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git@github\.com:/, 'https://github.com/');
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[A-Za-z0-9_.\-/]+)?$/.test(
    normalized
  )
    ? normalized
    : null;
}

export function buildDependencyPlan(outdated, sourceSha, generatedAt) {
  const groups = { runtime: [], development: [], actions: [] };
  for (const [name, entry] of Object.entries(outdated)) {
    const group = groupFor(entry.dependencyType);
    if (!group) continue;
    const current = entry.current ?? '';
    const latest = entry.latest ?? '';
    groups[group].push({
      name,
      current,
      wanted: entry.wanted ?? null,
      latest,
      compatibility: classifyCompatibility(current, latest),
      dependents: Array.isArray(entry.dependentPackages)
        ? entry.dependentPackages
            .map((dependent) => dependent.name)
            .filter(Boolean)
            .sort()
        : [],
      releaseNotes: repositoryUrl(entry.latestManifest),
    });
  }
  for (const candidates of Object.values(groups)) {
    candidates.sort((left, right) => left.name.localeCompare(right.name));
  }
  return { sourceSha, generatedAt, mode: 'read-only-plan', groups };
}

function renderSummary(plan) {
  const lines = [
    '## Dependency update candidates (read-only)',
    '',
    `- Source SHA: \`${plan.sourceSha}\``,
    `- Generated: ${plan.generatedAt}`,
    '',
  ];
  for (const [group, candidates] of Object.entries(plan.groups)) {
    lines.push(`### ${group} (${candidates.length})`, '');
    if (candidates.length === 0) {
      lines.push('No updates reported.', '');
      continue;
    }
    lines.push(
      '| Package/action | Current | Wanted | Latest | Compatibility | Dependents | Release notes |',
      '| --- | --- | --- | --- | --- | --- | --- |'
    );
    for (const item of candidates) {
      const cells = [
        item.name,
        item.current,
        item.wanted ?? '—',
        item.latest,
        item.compatibility,
        item.dependents.join(', ') || '—',
        item.releaseNotes ? `${item.releaseNotes}/releases` : '—',
      ].map((value) => String(value).replace(/[|\r\n]/g, ' '));
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  lines.push(
    'Plan generation did not update manifests, lockfiles, branches, issues, or pull requests.',
    ''
  );
  return lines.join('\n');
}

function loadOutdatedJson() {
  let stdout;
  try {
    stdout = execSync('pnpm outdated --recursive --format json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (error) {
    if (error.status !== 1 || typeof error.stdout !== 'string') {
      throw new Error(`pnpm outdated failed (exit ${String(error.status)}).`, { cause: error });
    }
    stdout = error.stdout;
  }
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected an object keyed by package or action name.');
    }
    return parsed;
  } catch (error) {
    throw new Error('pnpm outdated did not return valid JSON.', { cause: error });
  }
}

function gitSourceSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function main(args) {
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : 'dependency-update-plan.json';
  if (outputIndex >= 0 && (!outputPath || outputPath.startsWith('--'))) {
    throw new Error('--output requires a path.');
  }
  const sourceIndex = args.indexOf('--source-sha');
  const sourceSha = sourceIndex >= 0 ? args[sourceIndex + 1] : gitSourceSha();
  if (!sourceSha || sourceSha.startsWith('--')) throw new Error('--source-sha requires a value.');

  const plan = buildDependencyPlan(loadOutdatedJson(), sourceSha, new Date().toISOString());
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  writeFileSync(resolve(outputPath), serialized, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(renderSummary(plan));
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) writeFileSync(summaryPath, renderSummary(plan), { encoding: 'utf8', flag: 'a' });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
