import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const COMPATIBILITY_REVIEW_GATES = [
  'pnpm lint',
  'pnpm format:check',
  'pnpm typecheck',
  'pnpm test:unit',
  'pnpm test:integration',
  'pnpm test:e2e',
  'pnpm test:ui-catalog',
  'pnpm test:ui-budget',
  'pnpm test:architecture',
  'pnpm architecture:check',
  'pnpm docs:check',
  'pnpm test:docs-portal',
];

function majorImpactReport({ name, current, latest, dependents, releaseNotes }) {
  return {
    status: 'manual-review-required',
    current,
    target: latest,
    releaseNotes,
    workspaceDependents: dependents,
    requiredTasks: [
      'Review every upstream migration guide and breaking change between current and target versions.',
      'Search the repository for imported APIs, package configuration, and runtime behavior affected by the major update.',
      'Map each breaking change to workspace dependents and record the required source/data/API migration.',
      'Document rollback constraints and assign an owner before applying the candidate.',
      'Do not select the major candidate for automatic application; submit a manual, reviewed compatibility plan.',
    ],
    requiredGates: [...COMPATIBILITY_REVIEW_GATES],
    securityScans: [
      'Workspace dependencies: block CRITICAL findings.',
      'Candidate API and Board images: block CRITICAL findings.',
    ],
    package: name,
  };
}

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
    const candidate = {
      name,
      current,
      wanted: entry.wanted ?? null,
      latest,
      compatibility: classifyCompatibility(current, latest),
      wantedCompatibility: classifyCompatibility(current, entry.wanted ?? latest),
      dependents: Array.isArray(entry.dependentPackages)
        ? entry.dependentPackages
            .map((dependent) => dependent.name)
            .filter(Boolean)
            .sort()
        : [],
      releaseNotes: repositoryUrl(entry.latestManifest),
    };
    if (candidate.compatibility === 'major' || candidate.wantedCompatibility === 'major') {
      candidate.majorImpact = majorImpactReport(candidate);
    }
    groups[group].push(candidate);
  }
  for (const candidates of Object.values(groups)) {
    candidates.sort((left, right) => left.name.localeCompare(right.name));
  }
  return { sourceSha, generatedAt, mode: 'read-only-plan', groups };
}

export function selectUpdateCandidate(plan, packageName) {
  if (
    !plan ||
    plan.mode !== 'read-only-plan' ||
    !Array.isArray(plan.groups?.runtime) ||
    !Array.isArray(plan.groups?.development) ||
    !Array.isArray(plan.groups?.actions)
  ) {
    throw new Error('Invalid dependency candidate plan.');
  }
  const candidates = [...plan.groups.runtime, ...plan.groups.development];
  const matches = candidates.filter((candidate) => candidate.name === packageName);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one package candidate named ${packageName}; found ${matches.length}.`
    );
  }
  const [candidate] = matches;
  if (typeof candidate.wanted !== 'string' || candidate.wanted.includes('-')) {
    throw new Error(`Candidate ${packageName} is a prerelease or has no exact wanted version.`);
  }
  if (!['patch', 'minor', 'major'].includes(candidate.wantedCompatibility)) {
    throw new Error(`Candidate ${packageName} has unknown compatibility and cannot be applied.`);
  }
  if (candidate.wantedCompatibility === 'major') {
    throw new Error(`Major candidate ${packageName} is report-only and cannot be auto-applied.`);
  }
  return {
    packageName: candidate.name,
    version: candidate.wanted,
    sourceSha: plan.sourceSha,
    compatibility: candidate.wantedCompatibility,
  };
}

export function renderSummary(plan) {
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
      '| Package/action | Current | Wanted | Wanted class | Latest | Latest class | Dependents | Release notes |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |'
    );
    for (const item of candidates) {
      const cells = [
        item.name,
        item.current,
        item.wanted ?? '—',
        item.wantedCompatibility,
        item.latest,
        item.compatibility,
        item.dependents.join(', ') || '—',
        item.releaseNotes ? `${item.releaseNotes}/releases` : '—',
      ].map((value) => String(value).replace(/[|\r\n]/g, ' '));
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');
    for (const item of candidates) {
      if (!item.majorImpact) continue;
      lines.push(
        `#### Major compatibility review: ${item.name}`,
        '',
        `- Current: \`${item.majorImpact.current}\`; target: \`${item.majorImpact.target}\`.`,
        `- Direct workspace dependents: ${item.majorImpact.workspaceDependents.join(', ') || 'not reported; inventory them before planning'}.`,
        `- Upstream release notes: ${item.majorImpact.releaseNotes ? `${item.majorImpact.releaseNotes}/releases` : 'not reported; locate and record authoritative notes before planning'}.`,
        '- Status: manual review required; the candidate executor refuses major updates.',
        '- Required migration and verification tasks:'
      );
      for (const task of item.majorImpact.requiredTasks) lines.push(`  - ${task}`);
      lines.push('- Required full candidate gates:');
      for (const gate of item.majorImpact.requiredGates) lines.push(`  - \`${gate}\``);
      for (const scan of item.majorImpact.securityScans) lines.push(`  - ${scan}`);
      lines.push('');
    }
  }
  lines.push(
    'Plan generation did not update manifests, lockfiles, branches, issues, or pull requests. Major and prerelease candidates are report-only.',
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

  const selectedIndex = args.indexOf('--select');
  if (selectedIndex >= 0) {
    const packageName = args[selectedIndex + 1];
    if (!packageName || packageName.startsWith('--'))
      throw new Error('--select requires a package name.');
    const plan = buildDependencyPlan(loadOutdatedJson(), sourceSha, new Date().toISOString());
    process.stdout.write(`${JSON.stringify(selectUpdateCandidate(plan, packageName))}\n`);
    return;
  }

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
