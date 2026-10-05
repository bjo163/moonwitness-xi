import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowedTaskKeys = new Set([
  'id',
  'title',
  'milestone',
  'dependsOn',
  'output',
  'detailFile',
  'labels',
  'priority',
  'assignee',
  'status',
  'evidence',
]);
const allowedRootKeys = new Set(['schemaVersion', 'description', 'tasks']);
const taskIdPattern = /^M(?:0|[1-9][0-9]*)\.[0-9]{2}$/u;
const milestonePattern = /^M(?:0|[1-9][0-9]*)$/u;

/** @typedef {'todo' | 'in_progress' | 'blocked' | 'complete'} TaskStatus */
/** @typedef {'p0' | 'p1' | 'p2' | 'p3'} TaskPriority */
/**
 * @typedef {object} RoadmapTask
 * @property {string} id
 * @property {string} title
 * @property {string} milestone
 * @property {string[]} dependsOn
 * @property {string} output
 * @property {string} detailFile
 * @property {string[]=} labels
 * @property {TaskPriority=} priority
 * @property {string=} assignee
 * @property {TaskStatus=} status
 * @property {string=} evidence
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeRoadmapPath(value, prefix) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value))
    return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && value.startsWith(prefix) && !value.split('/').includes('..');
}

function evidenceLinksFromLine(line) {
  return [...line.matchAll(/\[([^\]]+)\]\((docs\/roadmap\/evidence\/[^)#]+\.md)\)/gu)].map(
    ([, label, filePath]) => ({ label, filePath })
  );
}

function evidenceLabelCoversTask(label, id) {
  if (label.includes(id)) return true;
  const range = /^(M(?:0|[1-9][0-9]*)\.([0-9]{2}))[–-](M(?:0|[1-9][0-9]*)\.([0-9]{2}))$/u.exec(
    label
  );
  if (!range || range[1].split('.')[0] !== range[3].split('.')[0]) return false;
  const taskNumber = Number(id.split('.')[1]);
  return (
    id.split('.')[0] === range[1].split('.')[0] &&
    taskNumber >= Number(range[2]) &&
    taskNumber <= Number(range[4])
  );
}

/**
 * @param {unknown} input
 * @param {string} roadmap
 * @param {ReadonlyMap<string, string>} documents
 * @returns {string[]}
 */
export function validateRoadmapIndex(input, roadmap, documents) {
  const problems = [];
  if (!isRecord(input)) return ['Task index root must be an object.'];
  for (const key of Object.keys(input)) {
    if (!allowedRootKeys.has(key)) problems.push(`Task index has unsupported property "${key}".`);
  }
  if (input.schemaVersion !== 1) problems.push('Task index schemaVersion must equal 1.');
  if (typeof input.description !== 'string' || input.description.trim().length === 0) {
    problems.push('Task index description must be a non-empty string.');
  }
  if (!Array.isArray(input.tasks)) return [...problems, 'Task index tasks must be an array.'];

  /** @type {RoadmapTask[]} */
  const tasks = [];
  const seenIds = new Set();
  for (const [index, candidate] of input.tasks.entries()) {
    const prefix = `tasks[${index}]`;
    if (!isRecord(candidate)) {
      problems.push(`${prefix} must be an object.`);
      continue;
    }
    for (const key of Object.keys(candidate)) {
      if (!allowedTaskKeys.has(key)) problems.push(`${prefix} has unsupported property "${key}".`);
    }
    const id = candidate.id;
    if (typeof id !== 'string' || !taskIdPattern.test(id)) {
      problems.push(`${prefix}.id must use the stable M<n>.<two-digit task> format.`);
      continue;
    }
    if (seenIds.has(id)) problems.push(`${id} is duplicated in tasks.json.`);
    seenIds.add(id);
    if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
      problems.push(`${id}.title must be a non-empty string.`);
    }
    if (typeof candidate.milestone !== 'string' || !milestonePattern.test(candidate.milestone)) {
      problems.push(`${id}.milestone must use the M<n> format.`);
    } else if (id.split('.')[0] !== candidate.milestone) {
      problems.push(`${id}.milestone must match its task ID prefix.`);
    }
    if (
      !Array.isArray(candidate.dependsOn) ||
      candidate.dependsOn.some(
        (dependency) => typeof dependency !== 'string' || !taskIdPattern.test(dependency)
      )
    ) {
      problems.push(`${id}.dependsOn must contain stable task IDs.`);
    } else if (new Set(candidate.dependsOn).size !== candidate.dependsOn.length) {
      problems.push(`${id}.dependsOn contains duplicates.`);
    }
    if (typeof candidate.output !== 'string' || candidate.output.trim().length === 0) {
      problems.push(`${id}.output must be a non-empty string.`);
    }
    if (!isSafeRoadmapPath(candidate.detailFile, 'docs/roadmap/')) {
      problems.push(`${id}.detailFile must be a safe repository-relative docs/roadmap path.`);
    } else if (!/^docs\/roadmap\/[a-z0-9-]+\.md$/u.test(candidate.detailFile)) {
      problems.push(`${id}.detailFile must reference one roadmap Markdown card file.`);
    } else if (!documents.has(candidate.detailFile)) {
      problems.push(`${id}.detailFile does not exist: ${candidate.detailFile}.`);
    } else {
      const card = documents.get(candidate.detailFile) ?? '';
      const heading = new RegExp(`^##\\s+${id.replace('.', '\\.')}\\s+(?:—|-|–)`, 'mu');
      if (!heading.test(card))
        problems.push(`${id} has no matching card heading in ${candidate.detailFile}.`);
    }
    if (
      candidate.labels !== undefined &&
      (!Array.isArray(candidate.labels) ||
        candidate.labels.some(
          (label) => typeof label !== 'string' || !/^[a-z0-9][a-z0-9:-]{0,49}$/u.test(label)
        ))
    ) {
      problems.push(`${id}.labels must be unique lowercase namespace-compatible labels.`);
    } else if (
      Array.isArray(candidate.labels) &&
      new Set(candidate.labels).size !== candidate.labels.length
    ) {
      problems.push(`${id}.labels contains duplicates.`);
    }
    if (
      candidate.priority !== undefined &&
      !['p0', 'p1', 'p2', 'p3'].includes(candidate.priority)
    ) {
      problems.push(`${id}.priority must be p0, p1, p2, or p3.`);
    }
    if (
      candidate.assignee !== undefined &&
      (typeof candidate.assignee !== 'string' || !/^[A-Za-z0-9-]{1,39}$/u.test(candidate.assignee))
    ) {
      problems.push(`${id}.assignee must be a GitHub login.`);
    }
    if (
      candidate.status !== undefined &&
      !['todo', 'in_progress', 'blocked', 'complete'].includes(candidate.status)
    ) {
      problems.push(`${id}.status is not a supported source status.`);
    }
    if (candidate.evidence !== undefined) {
      const expectedEvidence = `docs/roadmap/evidence/${id}.md`;
      if (candidate.evidence !== expectedEvidence || !documents.has(candidate.evidence)) {
        problems.push(`${id}.evidence must resolve to its existing ${expectedEvidence} file.`);
      }
    }
    tasks.push(/** @type {RoadmapTask} */ (candidate));
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (!Array.isArray(task.dependsOn)) continue;
    for (const dependency of task.dependsOn) {
      if (!taskById.has(dependency))
        problems.push(`${task.id} depends on missing task ${dependency}.`);
      if (dependency === task.id) problems.push(`${task.id} cannot depend on itself.`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      problems.push(`Dependency cycle includes ${id}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const dependencies = taskById.get(id)?.dependsOn;
    if (!Array.isArray(dependencies)) return;
    for (const dependency of dependencies) {
      if (taskById.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of taskById.keys()) visit(id);

  const roadmapEntries = new Map();
  for (const [index, line] of roadmap.split(/\r?\n/u).entries()) {
    const match = /^\s*-\s*\[([ xX])\]\s+(M(?:0|[1-9][0-9]*)\.[0-9]{2})\b/u.exec(line);
    if (!match) continue;
    const [, checked, id] = match;
    const existing = roadmapEntries.get(id) ?? [];
    existing.push({
      checked: checked.toLowerCase() === 'x',
      line: index + 1,
      evidenceLinks: evidenceLinksFromLine(line),
    });
    roadmapEntries.set(id, existing);
  }
  for (const task of tasks) {
    const entries = roadmapEntries.get(task.id) ?? [];
    if (entries.length !== 1) {
      problems.push(`${task.id} must appear exactly once as a master roadmap checkbox.`);
      continue;
    }
    const checked = entries[0].checked;
    if (checked) {
      const evidencePath = `docs/roadmap/evidence/${task.id}.md`;
      const linkedEvidence = entries[0].evidenceLinks.some(
        ({ label, filePath }) => evidenceLabelCoversTask(label, task.id) && documents.has(filePath)
      );
      if (!linkedEvidence && !documents.has(evidencePath)) {
        problems.push(
          `${task.id} is checked complete but has no linked evidence file for this task.`
        );
      }
      if (task.status !== undefined && task.status !== 'complete') {
        problems.push(`${task.id} is checked complete but tasks.json status is ${task.status}.`);
      }
    } else if (task.status === 'complete') {
      problems.push(`${task.id} status is complete but its master roadmap checkbox is open.`);
    }
  }
  for (const id of roadmapEntries.keys()) {
    if (!taskById.has(id))
      problems.push(`${id} appears in ROADMAP.md but is missing from tasks.json.`);
  }
  return [...new Set(problems)];
}

async function loadRepository() {
  const indexPath = path.join(repositoryRoot, 'docs/roadmap/tasks.json');
  const roadmapPath = path.join(repositoryRoot, 'ROADMAP.md');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const roadmap = await readFile(roadmapPath, 'utf8');
  /** @type {Map<string, string>} */
  const documents = new Map();
  const candidatePaths = new Set([
    ...index.tasks.flatMap((task) => [task.detailFile, task.evidence].filter(Boolean)),
    ...index.tasks.map((task) => `docs/roadmap/evidence/${task.id}.md`),
    ...[...roadmap.matchAll(/\[[^\]]+\]\((docs\/roadmap\/evidence\/[^)#]+\.md)\)/gu)].map(
      ([, relativePath]) => relativePath
    ),
  ]);
  for (const relativePath of candidatePaths) {
    if (typeof relativePath !== 'string' || !isSafeRoadmapPath(relativePath, 'docs/roadmap/'))
      continue;
    try {
      await access(path.join(repositoryRoot, relativePath));
      documents.set(relativePath, await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
    } catch {
      // The pure validator reports absent references with the owning task ID.
    }
  }
  return { index, roadmap, documents };
}

async function main() {
  try {
    const { index, roadmap, documents } = await loadRepository();
    const problems = validateRoadmapIndex(index, roadmap, documents);
    if (problems.length > 0) {
      for (const problem of problems) process.stderr.write(`${problem}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Validated schema, IDs, cards, evidence, dependencies and checkboxes for ${index.tasks.length} roadmap tasks.\n`
    );
  } catch (error) {
    process.stderr.write(`Unable to validate roadmap: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
