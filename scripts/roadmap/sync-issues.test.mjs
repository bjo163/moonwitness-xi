import assert from 'node:assert/strict';
import test from 'node:test';
import { URLSearchParams } from 'node:url';
import { applyIssuePlan, createGitHubIssuesClient, planIssueSync } from './sync-issues.mjs';

const task = {
  id: 'M11.03',
  title: 'Build planner',
  milestone: 'M11',
  dependsOn: ['M11.02'],
  detailFile: 'docs/roadmap/11-issues-delivery.md',
  output: 'Planner and tests',
};
const sourceSha = 'a'.repeat(40);
const repositoryId = '123456789';

function plan(issues = [], tasks = [task]) {
  return planIssueSync({ tasks, issues, repositoryId, sourceSha });
}

test('plan defaults to create and repeated identical remote state becomes no-op', () => {
  const first = plan();
  assert.equal(first.operations[0].operation, 'create');
  const issue = {
    number: 17,
    title: first.operations[0].title,
    body: first.operations[0].body,
    state: 'open',
  };
  assert.equal(plan([issue]).operations[0].operation, 'noop');
});

test('managed issue update preserves maintainer notes outside the generated block', () => {
  const existing = plan().operations[0];
  const issue = {
    number: 8,
    title: '[M11.03] old title',
    body: `${existing.body}\n\n## Catatan maintainer\nKeep this note.`,
    state: 'open',
  };
  const changedTask = { ...task, title: 'Build robust planner' };
  const operation = plan([issue], [changedTask]).operations[0];
  assert.equal(operation.operation, 'update');
  assert.match(operation.body, /Keep this note\./u);
  assert.match(operation.title, /Build robust planner/u);
});

test('closed issues are discovered, pull requests ignored and duplicate identity conflicts', () => {
  const base = plan().operations[0];
  const issue = { number: 9, title: base.title, body: base.body, state: 'closed' };
  assert.equal(plan([issue]).operations[0].operation, 'noop');
  assert.equal(
    plan([{ ...issue, pull_request: { url: 'https://example.invalid' } }]).operations[0].operation,
    'create'
  );
  assert.equal(plan([issue, { ...issue, number: 10 }]).operations[0].operation, 'conflict');
});

test('repository identity is scoped and malformed generated boundaries conflict', () => {
  const base = plan().operations[0];
  const otherRepoBody = base.body.replace(repositoryId, '987654321');
  assert.equal(
    plan([{ number: 1, title: base.title, body: otherRepoBody, state: 'open' }]).operations[0]
      .operation,
    'create'
  );
  const malformed = {
    number: 2,
    title: base.title,
    body: `${base.body}\n${base.body}`,
    state: 'open',
  };
  assert.equal(plan([malformed]).operations[0].operation, 'conflict');
});

test('apply refuses stale plans and performs serial writes only for explicit operations', async () => {
  const stalePlan = plan();
  const changed = { number: 4, title: 'unrelated', body: 'human', state: 'open' };
  const client = {
    listAll: async () => [changed],
    create: async () => assert.fail('must not create stale plan'),
    update: async () => assert.fail('must not update stale plan'),
  };
  await assert.rejects(
    applyIssuePlan({ plan: stalePlan, client, tasks: [task], repositoryId, sourceSha }),
    /changed after planning/u
  );
});

test('apply rejects any duplicate conflict before the first remote mutation', async () => {
  const createTask = { ...task, id: 'M11.04', title: 'Create task' };
  const duplicateBody = plan().operations[0].body;
  const duplicateIssues = [
    { number: 7, title: '[M11.03] one', body: duplicateBody, state: 'open' },
    { number: 8, title: '[M11.03] two', body: duplicateBody, state: 'closed' },
  ];
  const conflictPlan = plan(duplicateIssues, [createTask, task]);
  const calls = [];
  const client = {
    listAll: async () => duplicateIssues,
    create: async () => calls.push('create'),
    update: async () => calls.push('update'),
  };
  await assert.rejects(
    applyIssuePlan({
      plan: conflictPlan,
      client,
      tasks: [createTask, task],
      repositoryId,
      sourceSha,
    }),
    /Duplicate managed identity/u
  );
  assert.deepEqual(calls, []);
});

test('ambiguous create failure re-reads marker and recovers without creating a duplicate', async () => {
  const expected = plan().operations[0];
  let calls = 0;
  const client = {
    listAll: async () => {
      calls += 1;
      return calls === 1
        ? []
        : [{ number: 44, title: expected.title, body: expected.body, state: 'open' }];
    },
    create: async () => {
      throw new Error('response timed out after server accepted create');
    },
    update: async () => assert.fail('no generated content change expected'),
  };
  const result = await applyIssuePlan({
    plan: plan(),
    client,
    tasks: [task],
    repositoryId,
    sourceSha,
  });
  assert.deepEqual(result, [{ taskId: 'M11.03', issueNumber: 44, recovered: true }]);
});

test('GitHub issue adapter follows open and closed pagination and serializes issue writes', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (init.method === 'POST' || init.method === 'PATCH')
      return { ok: true, status: 200, json: async () => ({ number: 1 }) };
    const urlText = String(url);
    const query = urlText.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    const state = params.get('state');
    const page = params.get('page');
    if (state === 'open' && page === '1')
      return {
        ok: true,
        status: 200,
        json: async () => Array.from({ length: 100 }, (_, i) => ({ number: i + 1 })),
      };
    if (state === 'open') return { ok: true, status: 200, json: async () => [] };
    return { ok: true, status: 200, json: async () => [{ number: 101 }] };
  };
  const client = createGitHubIssuesClient({
    token: 'test-token',
    owner: 'owner',
    repo: 'repo',
    fetchImpl,
  });
  assert.equal((await client.listAll()).length, 101);
  assert.equal(calls.length, 3);
  await client.create({ title: 'test', body: 'body' });
  assert.equal(calls[3].init.method, 'POST');
  assert.equal(calls[3].init.body.includes('test-token'), false);
});
