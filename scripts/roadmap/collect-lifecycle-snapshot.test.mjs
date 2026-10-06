import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectLifecycleSnapshot,
  parseEvidenceSourceSha,
  parseRoadmapTaskStates,
} from './collect-lifecycle-snapshot.mjs';
import { projectLifecycleSnapshot } from './lifecycle-snapshot.mjs';

const sourceSha = 'a'.repeat(40);
const planSha = 'b'.repeat(40);
const devSha = 'c'.repeat(40);
const mainSha = 'd'.repeat(40);
const releaseSha = 'e'.repeat(40);
const task = { id: 'M1.01', dependsOn: [], status: 'complete', evidence: 'evidence.md' };
const indexTasks = [task, { id: 'M1.02', dependsOn: [], evidence: 'partial.md' }];
const roadmap = '- [x] M1.01 Finished with evidence.\n- [ ] M1.02 In progress.\n';

test('parses the explicit source commit marker and derives canonical roadmap task states', () => {
  assert.equal(parseEvidenceSourceSha(`# Evidence\n- Source SHA: \`${sourceSha}\`\n`), sourceSha);
  assert.equal(
    parseEvidenceSourceSha('# Evidence\n- Audit only, no source commit recorded.\n'),
    undefined
  );
  const states = parseRoadmapTaskStates(roadmap, indexTasks);
  assert.deepEqual(states.get('M1.01'), { status: 'complete', acceptanceVerified: true });
  assert.deepEqual(states.get('M1.02'), { status: 'todo', acceptanceVerified: false });
  assert.throws(
    () => parseRoadmapTaskStates(`${roadmap}- [ ] M1.01 Duplicate.\n`, indexTasks),
    /exactly one/u
  );
  assert.throws(
    () => parseRoadmapTaskStates(`${roadmap}- [x] M1.99 Unknown.\n`, indexTasks),
    /unindexed task/u
  );
});

test('collects current checks and ancestry without confusing evidence SHA with implementation SHA', async () => {
  const snapshot = await collectLifecycleSnapshot({
    tasks: indexTasks,
    roadmap,
    readEvidence: async (file) =>
      file === 'evidence.md' ? `# Evidence\n- Source SHA: \`${sourceSha}\`\n` : '# In progress\n',
    repositoryId: '12345',
    sourceSha: planSha,
    branchHeads: { dev: devSha, main: mainSha },
    checkRuns: [
      { id: 1, name: 'ci-gate', head_sha: devSha, status: 'completed', conclusion: 'failure' },
      { id: 2, name: 'ci-gate', head_sha: devSha, status: 'completed', conclusion: 'success' },
      { id: 3, name: 'ci-gate', head_sha: sourceSha, status: 'completed', conclusion: 'success' },
      { id: 4, name: 'CodeQL', head_sha: devSha, status: 'completed', conclusion: 'success' },
    ],
    releases: [],
    resolveReleaseCommit: () => undefined,
    commitExists: (sha) => sha === sourceSha,
    isAncestor: (source, branch) => source === sourceSha && branch === devSha,
    generatedAt: '2026-10-07T10:00:00.000Z',
  });
  const row = snapshot.tasks.find(({ taskId }) => taskId === 'M1.01');
  assert.equal(row.evidenceSha, planSha);
  assert.equal(row.sourceSha, sourceSha);
  assert.equal(row.sourceInDev, true);
  assert.equal(row.sourceInMain, false);
  assert.deepEqual(row.requiredChecks, [
    { name: 'ci-gate', headSha: devSha, status: 'completed', conclusion: 'success' },
  ]);
  const projected = projectLifecycleSnapshot({
    snapshot,
    tasks: indexTasks,
    issues: [],
    repositoryId: '12345',
    sourceSha: planSha,
    now: Date.parse('2026-10-07T10:00:00.000Z'),
  });
  assert.equal(projected.get('M1.01').deliveryStage, 'verified-dev');
});

test('adds release delivery only when the source is proven on main and in the release ancestry', async () => {
  const snapshot = await collectLifecycleSnapshot({
    tasks: [task],
    roadmap: '- [x] M1.01 Done.\n',
    readEvidence: async () => `- Source SHA: ${sourceSha}`,
    repositoryId: '12345',
    sourceSha: planSha,
    branchHeads: { dev: devSha, main: mainSha },
    checkRuns: [],
    releases: [
      {
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        published_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    resolveReleaseCommit: () => releaseSha,
    commitExists: () => true,
    isAncestor: (source, branch) =>
      source === planSha && branch === mainSha
        ? false
        : source === 'a'.repeat(40) && [mainSha, releaseSha].includes(branch),
    generatedAt: '2026-10-07T10:00:00.000Z',
  });
  const row = snapshot.tasks[0];
  assert.equal(row.sourceInMain, true);
  assert.deepEqual(row.releaseManifest, { version: 'v1.2.3', sourceSha: releaseSha });
  assert.equal(row.releaseContainsSource, true);
});
