import { evaluateTaskLifecycle } from './lifecycle.mjs';

const maximumSnapshotAgeMs = 5 * 60 * 1000;

function isFullSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
}

function findIssueState(issues, taskId, repositoryId) {
  const marker = `<!-- moonwitness-task: ${repositoryId}:${taskId} -->`;
  const matches = issues.filter((issue) => issue.body?.includes(marker) && !issue.pull_request);
  if (matches.length > 1)
    throw new Error(`Lifecycle snapshot found duplicate issues for ${taskId}.`);
  return matches[0]?.state ?? 'open';
}

/**
 * Validate and project an ephemeral lifecycle snapshot onto selected roadmap tasks.
 * Snapshots are input data only; this function performs no network or write operations.
 * @param {{snapshot: unknown, tasks: Array<{id:string,dependsOn:string[]}>, issues: Array<{body?:string,state:'open'|'closed',pull_request?:unknown}>, repositoryId:string, sourceSha:string, now?:number}} input
 * @returns {Map<string, ReturnType<typeof evaluateTaskLifecycle>>}
 */
export function projectLifecycleSnapshot({
  snapshot,
  tasks,
  issues,
  repositoryId,
  sourceSha,
  now = Date.now(),
}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new Error('Lifecycle snapshot must be a JSON object.');
  if (snapshot.schemaVersion !== 1) throw new Error('Lifecycle snapshot schemaVersion must be 1.');
  if (snapshot.repositoryId !== repositoryId)
    throw new Error('Lifecycle snapshot repository ID does not match this repository.');
  if (!isFullSha(sourceSha) || snapshot.sourceSha !== sourceSha)
    throw new Error('Lifecycle snapshot source SHA does not match the current plan SHA.');
  const generatedAt = Date.parse(snapshot.generatedAt);
  if (
    !Number.isFinite(generatedAt) ||
    generatedAt > now ||
    now - generatedAt > maximumSnapshotAgeMs
  )
    throw new Error('Lifecycle snapshot must be no more than five minutes old.');
  const branchHeads = snapshot.branchHeads;
  if (!branchHeads || !isFullSha(branchHeads.dev) || !isFullSha(branchHeads.main))
    throw new Error('Lifecycle snapshot must identify full dev and main head SHAs.');
  if (!Array.isArray(snapshot.tasks)) throw new Error('Lifecycle snapshot tasks must be an array.');
  const records = new Map();
  for (const record of snapshot.tasks) {
    if (!record || typeof record !== 'object' || typeof record.taskId !== 'string')
      throw new Error('Lifecycle snapshot contains a malformed task record.');
    if (records.has(record.taskId))
      throw new Error(`Duplicate lifecycle record for ${record.taskId}.`);
    records.set(record.taskId, record);
  }

  const allTasks = new Map(tasks.map((task) => [task.id, task]));
  for (const taskId of records.keys()) {
    if (!allTasks.has(taskId))
      throw new Error(`Lifecycle snapshot contains unknown task ${taskId}.`);
  }
  const completeTaskIds = new Set(
    [...records.values()]
      .filter((record) => record.status === 'complete' && record.acceptanceVerified === true)
      .map((record) => record.taskId)
  );
  const result = new Map();
  for (const task of tasks) {
    const record = records.get(task.id);
    if (!record) throw new Error(`Lifecycle snapshot is missing ${task.id}.`);
    const dependencyIds = task.dependsOn ?? [];
    const incompleteDependencyIds = dependencyIds.filter((id) => !completeTaskIds.has(id));
    for (const dependencyId of dependencyIds) {
      if (!allTasks.has(dependencyId))
        throw new Error(`Task ${task.id} declares unknown dependency ${dependencyId}.`);
    }
    result.set(
      task.id,
      evaluateTaskLifecycle({
        ...record,
        dependencyIds,
        incompleteDependencyIds,
        devHeadSha: branchHeads.dev,
        mainHeadSha: branchHeads.main,
        issueState: findIssueState(issues, task.id, repositoryId),
      })
    );
  }
  return result;
}
