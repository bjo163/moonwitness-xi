import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRoadmapIndex } from './validate-roadmap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = JSON.parse(await readFile(path.join(root, 'docs/roadmap/task.schema.json'), 'utf8'));

function fixture() {
  const index = {
    schemaVersion: 1,
    description: 'fixture',
    tasks: [
      {
        id: 'M11.01',
        title: 'Policy',
        milestone: 'M11',
        dependsOn: [],
        output: 'policy.md',
        detailFile: 'docs/roadmap/11-issues-delivery.md',
        labels: ['roadmap', 'lane:automation'],
        priority: 'p1',
        assignee: 'maintainer-1',
        status: 'complete',
        evidence: 'docs/roadmap/evidence/M11.01.md',
      },
      {
        id: 'M11.02',
        title: 'Schema',
        milestone: 'M11',
        dependsOn: ['M11.01'],
        output: 'task schema',
        detailFile: 'docs/roadmap/11-issues-delivery.md',
      },
    ],
  };
  const roadmap = [
    '- [x] M11.01 Define policy. Evidence: [M11.01](docs/roadmap/evidence/M11.01.md).',
    '- [ ] M11.02 Add schema.',
  ].join('\n');
  const documents = new Map([
    ['docs/roadmap/11-issues-delivery.md', '## M11.01 — Policy\n## M11.02 — Schema'],
    ['docs/roadmap/evidence/M11.01.md', '# Evidence M11.01'],
  ]);
  return { index, roadmap, documents };
}

test('schema declares versioned tasks and optional prioritization/assignment fields', () => {
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.$defs.task.required, [
    'id',
    'title',
    'milestone',
    'dependsOn',
    'output',
    'detailFile',
  ]);
  assert.deepEqual(schema.$defs.task.properties.priority.enum, ['p0', 'p1', 'p2', 'p3']);
  assert.ok(schema.$defs.task.properties.assignee);
  assert.ok(schema.$defs.task.properties.labels);
});

test('accepts stable unique IDs, safe cards, DAG dependencies, evidence and checkbox agreement', () => {
  const { index, roadmap, documents } = fixture();
  assert.deepEqual(validateRoadmapIndex(index, roadmap, documents), []);
});

test('rejects duplicate IDs, missing dependencies, unsafe paths, and dependency cycles', () => {
  const { index, roadmap, documents } = fixture();
  index.tasks[1].dependsOn = ['M11.02', 'M99.01'];
  index.tasks[1].detailFile = 'docs/roadmap/../secret.md';
  index.tasks.push({ ...index.tasks[0] });
  const problems = validateRoadmapIndex(index, roadmap, documents);
  assert.ok(problems.some((problem) => /duplicated/u.test(problem)));
  assert.ok(problems.some((problem) => /missing task M99.01/u.test(problem)));
  assert.ok(problems.some((problem) => /detailFile must be a safe/u.test(problem)));
  assert.ok(problems.some((problem) => /Dependency cycle/u.test(problem)));
});

test('rejects checkbox/evidence drift, missing detail headings, and malformed optional metadata', () => {
  const { index, roadmap, documents } = fixture();
  index.tasks[1].status = 'complete';
  index.tasks[1].priority = 'urgent';
  index.tasks[1].labels = ['Roadmap'];
  index.tasks[1].assignee = 'not a login';
  const brokenDocuments = new Map(documents);
  brokenDocuments.set('docs/roadmap/11-issues-delivery.md', '## M11.01 — Policy');
  const checked = roadmap.replace('- [ ] M11.02', '- [x] M11.02');
  const problems = validateRoadmapIndex(index, checked, brokenDocuments);
  assert.ok(problems.some((problem) => /no matching card heading/u.test(problem)));
  assert.ok(problems.some((problem) => /priority must be/u.test(problem)));
  assert.ok(problems.some((problem) => /labels must be/u.test(problem)));
  assert.ok(problems.some((problem) => /assignee must be/u.test(problem)));
  assert.ok(
    problems.some((problem) => /checked complete but has no linked evidence/u.test(problem))
  );
});

test('requires the issue index to reference an existing per-task evidence document', () => {
  const { index, roadmap, documents } = fixture();
  delete index.tasks[0].evidence;
  const problems = validateRoadmapIndex(index, roadmap, documents);
  assert.ok(
    problems.some((problem) =>
      problem.includes(
        'M11.01.evidence must reference an existing evidence file linked to this task'
      )
    )
  );
});

test('accepts a shared evidence file only when its roadmap range covers the task', () => {
  const { index, roadmap, documents } = fixture();
  const sharedEvidence = 'docs/roadmap/evidence/M11.01-02.md';
  index.tasks[0].evidence = sharedEvidence;
  const linkedRoadmap = roadmap.replace(
    '[M11.01](docs/roadmap/evidence/M11.01.md)',
    '[M11.01–M11.02](docs/roadmap/evidence/M11.01-02.md)'
  );
  const linkedDocuments = new Map(documents);
  linkedDocuments.set(sharedEvidence, '# Evidence M11.01–M11.02');
  assert.deepEqual(validateRoadmapIndex(index, linkedRoadmap, linkedDocuments), []);

  index.tasks[0].evidence = 'docs/roadmap/evidence/M11.03-04.md';
  const unrelatedEvidence = new Map(linkedDocuments);
  unrelatedEvidence.set(index.tasks[0].evidence, '# Unrelated range');
  assert.ok(
    validateRoadmapIndex(index, linkedRoadmap, unrelatedEvidence).some((problem) =>
      problem.includes(
        'M11.01.evidence must reference an existing evidence file linked to this task'
      )
    )
  );
});

test('rejects a roadmap checkbox without an index record or a duplicate checkbox', () => {
  const { index, roadmap, documents } = fixture();
  const broken = `${roadmap}\n- [ ] M99.01 Orphan.\n- [ ] M11.02 Duplicate.`;
  const problems = validateRoadmapIndex(index, broken, documents);
  assert.ok(problems.some((problem) => /M99.01 appears in ROADMAP.md/u.test(problem)));
  assert.ok(problems.some((problem) => /M11.02 must appear exactly once/u.test(problem)));
});

test('validates the live roadmap task index against cards, evidence and master checkboxes', async () => {
  const index = JSON.parse(await readFile(path.join(root, 'docs/roadmap/tasks.json'), 'utf8'));
  const roadmap = await readFile(path.join(root, 'ROADMAP.md'), 'utf8');
  const documents = new Map();
  const linkedEvidence = [
    ...roadmap.matchAll(/\[[^\]]+\]\((docs\/roadmap\/evidence\/[^)#]+\.md)\)/gu),
  ].map(([, relativePath]) => relativePath);
  for (const relativePath of [
    ...index.tasks.flatMap((task) => [task.detailFile, `docs/roadmap/evidence/${task.id}.md`]),
    ...linkedEvidence,
  ]) {
    if (documents.has(relativePath)) continue;
    try {
      documents.set(relativePath, await readFile(path.join(root, relativePath), 'utf8'));
    } catch {
      // Missing paths are asserted by the live validator.
    }
  }
  assert.deepEqual(validateRoadmapIndex(index, roadmap, documents), []);
});
