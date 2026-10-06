import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectLifecycleSnapshot } from './lifecycle-snapshot.mjs';
import { parseRoadmapTaskStates } from './collect-lifecycle-snapshot.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workKeys = ['todo', 'running', 'blocked', 'complete'];
const deliveryKeys = ['verified', 'main', 'released', 'planned', 'unknown'];

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function canonicalWorkStatus(status) {
  if (status === 'in_progress') return 'running';
  if (status === 'blocked') return 'blocked';
  if (status === 'complete') return 'complete';
  return 'todo';
}

function canonicalDeliveryStage(stage) {
  if (stage === 'verified-dev') return 'verified';
  if (stage === 'in-main') return 'main';
  if (stage === 'released') return 'released';
  if (stage === 'planned') return 'planned';
  return 'unknown';
}

/** Build a source-SHA-bound report. Delivery stays unknown without trusted lifecycle evidence. */
export function buildRoadmapProgress({
  tasks,
  roadmap,
  sourceSha,
  generatedAt,
  lifecycleByTask,
  sourceDirty = false,
}) {
  if (!/^[a-f0-9]{40}$/u.test(sourceSha))
    throw new Error('Progress source SHA must be a full Git SHA.');
  const states = parseRoadmapTaskStates(roadmap, tasks);
  const milestones = new Map();
  const items = tasks.map((task) => {
    const lifecycle = lifecycleByTask?.get(task.id);
    const workStatus = canonicalWorkStatus(lifecycle?.workStatus ?? states.get(task.id).status);
    const deliveryStage = canonicalDeliveryStage(lifecycle?.deliveryStage);
    const milestone = milestones.get(task.milestone) ?? {
      taskCount: 0,
      work: emptyCounts(workKeys),
      delivery: emptyCounts(deliveryKeys),
    };
    milestone.taskCount += 1;
    milestone.work[workStatus] += 1;
    milestone.delivery[deliveryStage] += 1;
    milestones.set(task.milestone, milestone);
    return {
      taskId: task.id,
      milestone: task.milestone,
      priority: task.priority ?? null,
      labels: [...(task.labels ?? [])].sort(),
      lane: (task.labels ?? []).find((label) => label.startsWith('lane:'))?.slice(5) ?? null,
      workStatus,
      deliveryStage,
      blockers: lifecycle?.blockers ?? [],
    };
  });
  const totals = {
    taskCount: items.length,
    work: emptyCounts(workKeys),
    delivery: emptyCounts(deliveryKeys),
  };
  for (const milestone of milestones.values()) {
    for (const key of workKeys) totals.work[key] += milestone.work[key];
    for (const key of deliveryKeys) totals.delivery[key] += milestone.delivery[key];
  }
  return {
    schemaVersion: 1,
    sourceSha,
    sourceDirty,
    generatedAt,
    deliveryEvidence: lifecycleByTask ? 'validated-lifecycle-snapshot' : 'not-provided',
    totals,
    milestones: Object.fromEntries(milestones),
    items,
  };
}

export function renderRoadmapProgressMarkdown(report) {
  const rows = Object.entries(report.milestones).map(([milestone, counts]) => {
    const work = counts.work;
    const delivery = counts.delivery;
    return `| ${milestone} | ${counts.taskCount} | ${work.todo} | ${work.running} | ${work.blocked} | ${work.complete} | ${delivery.verified} | ${delivery.main} | ${delivery.released} | ${delivery.planned} | ${delivery.unknown} |`;
  });
  const { work, delivery } = report.totals;
  return [
    '# Roadmap progress',
    '',
    `- Source SHA: \`${report.sourceSha}\``,
    `- Source tree: ${report.sourceDirty ? 'dirty' : 'clean'}`,
    `- Generated at: ${report.generatedAt}`,
    `- Delivery evidence: ${report.deliveryEvidence}`,
    `- Total tasks: ${report.totals.taskCount} (todo ${work.todo}, running ${work.running}, blocked ${work.blocked}, complete ${work.complete})`,
    `- Delivery totals: verified ${delivery.verified}, main ${delivery.main}, released ${delivery.released}, planned ${delivery.planned}, unknown ${delivery.unknown}`,
    '',
    '| Milestone | Tasks | Todo | Running | Blocked | Complete | Verified | In main | Released | Planned | Unknown |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    'Completion and delivery are separate. A checked roadmap task is counted as complete work; it is not counted as verified, merged, or released without a validated lifecycle snapshot.',
    '',
  ].join('\n');
}

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotIndex = args.indexOf('--lifecycle-snapshot');
  const outputIndex = args.indexOf('--output');
  const formatIndex = args.indexOf('--format');
  const snapshotPath = snapshotIndex >= 0 ? args[snapshotIndex + 1] : undefined;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  const format = formatIndex >= 0 ? args[formatIndex + 1] : 'markdown';
  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: pnpm roadmap:progress [--lifecycle-snapshot <file>] [--format markdown|json] [--output <file>]\n'
    );
    return;
  }
  if (
    args.some(
      (arg) =>
        arg.startsWith('--') && !['--lifecycle-snapshot', '--output', '--format'].includes(arg)
    )
  )
    throw new Error('Unknown roadmap progress option.');
  if (snapshotIndex >= 0 && (!snapshotPath || snapshotPath.startsWith('--')))
    throw new Error('--lifecycle-snapshot requires a file path.');
  if (outputIndex >= 0 && (!outputPath || outputPath.startsWith('--')))
    throw new Error('--output requires a repository-relative path.');
  if (formatIndex >= 0 && (!format || format.startsWith('--')))
    throw new Error('--format must be markdown or json.');
  if (!['markdown', 'json'].includes(format)) throw new Error('--format must be markdown or json.');
  const resolveInsideRepository = (relativePath, flag) => {
    const absolutePath = path.resolve(repositoryRoot, relativePath);
    if (absolutePath === repositoryRoot || !absolutePath.startsWith(`${repositoryRoot}${path.sep}`))
      throw new Error(`${flag} must stay inside the repository.`);
    return absolutePath;
  };
  const sha = git(['rev-parse', 'HEAD']);
  const sourceDirty = git(['status', '--porcelain']).length > 0;
  const generatedAt = new Date().toISOString();
  const [index, roadmap] = await Promise.all([
    readFile(path.join(repositoryRoot, 'docs/roadmap/tasks.json'), 'utf8').then(JSON.parse),
    readFile(path.join(repositoryRoot, 'ROADMAP.md'), 'utf8'),
  ]);
  let lifecycleByTask;
  if (snapshotPath) {
    const snapshot = JSON.parse(
      await readFile(resolveInsideRepository(snapshotPath, '--lifecycle-snapshot'), 'utf8')
    );
    lifecycleByTask = projectLifecycleSnapshot({
      snapshot,
      tasks: index.tasks,
      issues: [],
      repositoryId: snapshot.repositoryId,
      sourceSha: sha,
      now: Date.parse(generatedAt),
    });
  }
  execFileSync(
    process.execPath,
    [path.join(repositoryRoot, 'scripts/roadmap/validate-roadmap.mjs')],
    {
      cwd: repositoryRoot,
      stdio: 'ignore',
    }
  );
  const report = buildRoadmapProgress({
    tasks: index.tasks,
    roadmap,
    sourceSha: sha,
    sourceDirty,
    generatedAt,
    lifecycleByTask,
  });
  const output =
    format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderRoadmapProgressMarkdown(report);
  if (outputPath) {
    await writeFile(resolveInsideRepository(outputPath, '--output'), output, 'utf8');
    process.stdout.write(`Wrote roadmap progress report for ${sha}.\n`);
  } else process.stdout.write(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
