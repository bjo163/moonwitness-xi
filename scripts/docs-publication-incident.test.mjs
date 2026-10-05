import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planDocumentationIncident,
  updateDocumentationIncident,
} from './docs-publication-incident.mjs';

const repo = 'owner/repo';
const sha = 'a'.repeat(40);
const runUrl = (id) => `https://github.com/${repo}/actions/runs/${id}`;
const incidentInput = (id, status = 'failed') => ({
  status,
  sourceRef: 'main',
  sourceSha: sha,
  runId: String(id),
  runUrl: runUrl(id),
});

function incident(number, body = '') {
  return {
    number,
    title: 'Maintainer title',
    body,
    state: 'open',
    labels: [{ name: 'docs-publication' }, { name: 'triaged-by-human' }],
  };
}

test('creates one labelled incident with source and recovery details', () => {
  const plan = planDocumentationIncident({ issues: [], ...incidentInput(10) });
  assert.equal(plan.operation, 'create');
  assert.deepEqual(plan.labels, ['docs-publication']);
  assert.match(plan.body, /run #10/u);
  assert.match(plan.body, /Retry the trusted Pages workflow/u);
  assert.match(plan.body, /not an application release signal/u);
});

test('five repeated failures update one issue and preserve maintainer notes without comments', () => {
  let current = null;
  let creates = 0;
  let updates = 0;
  const comments = [];
  for (let id = 1; id <= 5; id++) {
    const plan = planDocumentationIncident({
      issues: current ? [current] : [],
      ...incidentInput(id),
    });
    if (plan.operation === 'create') {
      creates++;
      current = { ...incident(41, plan.body), body: `Maintainer notes survive.\n\n${plan.body}` };
    } else {
      assert.equal(plan.operation, 'update');
      updates++;
      current = { ...current, ...plan };
    }
  }
  const repeat = planDocumentationIncident({ issues: [current], ...incidentInput(5) });
  assert.equal(repeat.operation, 'noop');
  assert.equal(creates, 1);
  assert.equal(updates, 4);
  assert.deepEqual(comments, []);
  assert.match(current.body, /^Maintainer notes survive\./u);
  assert.equal((current.body.match(/moonwitness:docs-publication-run:/gu) ?? []).length, 5);
  assert.match(current.body, /run #5/u);
});

test('caps failure history at ten unique runs and retains issue metadata', () => {
  let current = null;
  for (let id = 1; id <= 12; id++) {
    const plan = planDocumentationIncident({
      issues: current ? [current] : [],
      ...incidentInput(id),
    });
    current = current ? { ...current, ...plan } : incident(42, plan.body);
  }
  assert.equal((current.body.match(/moonwitness:docs-publication-run:/gu) ?? []).length, 10);
  assert.match(current.body, /run #12/u);
  assert.doesNotMatch(current.body, /run #2\)/u);
  assert.deepEqual(
    current.labels.map((label) => (typeof label === 'string' ? label : label.name)),
    ['docs-publication', 'triaged-by-human']
  );
  assert.equal(current.title, 'Maintainer title');
});

test('successful trusted publication resolves only the docs incident and keeps failure history', () => {
  const failed = planDocumentationIncident({ issues: [], ...incidentInput(20) });
  const current = incident(43, failed.body);
  const recovered = planDocumentationIncident({
    issues: [current],
    ...incidentInput(21, 'recovered'),
  });
  assert.equal(recovered.operation, 'update');
  assert.equal(recovered.state, 'closed');
  assert.equal(recovered.state_reason, 'completed');
  assert.match(recovered.body, /RECOVERED/u);
  assert.match(recovered.body, /run #21/u);
  assert.match(recovered.body, /run #20/u);
  assert.deepEqual(recovered.labels, ['docs-publication', 'triaged-by-human']);
  assert.equal(
    planDocumentationIncident({ issues: [], ...incidentInput(22, 'recovered') }).operation,
    'noop'
  );
});

test('never selects or closes security reports, even when they are the only open issue', () => {
  const security = {
    number: 99,
    title: 'Security report',
    body: 'Investigate credential exposure',
    state: 'open',
    labels: [{ name: 'security' }],
  };
  const recovery = planDocumentationIncident({
    issues: [security],
    ...incidentInput(30, 'recovered'),
  });
  assert.equal(recovery.operation, 'noop');
  const failure = planDocumentationIncident({ issues: [security], ...incidentInput(31) });
  assert.equal(failure.operation, 'create');
  assert.equal(security.state, 'open');
  assert.equal(security.body, 'Investigate credential exposure');
});

test('duplicate docs incidents and malformed managed blocks fail closed', () => {
  const duplicate = planDocumentationIncident({
    issues: [incident(1), incident(2)],
    ...incidentInput(40),
  });
  assert.equal(duplicate.operation, 'conflict');
  assert.throws(
    () =>
      planDocumentationIncident({
        issues: [incident(3, '<!-- moonwitness:docs-publication:begin --> missing end')],
        ...incidentInput(41),
      }),
    /malformed managed-block/u
  );
});

test('GitHub adapter paginates before resolving and writes no comments', async () => {
  const calls = [];
  const existing = incident(77, 'Human note.');
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : undefined });
    if (String(url).endsWith('/labels/docs-publication'))
      return new globalThis.Response('{}', { status: 200 });
    if (String(url).includes('/issues?') && String(url).endsWith('page=1')) {
      return new globalThis.Response(JSON.stringify([]), {
        status: 200,
        headers: {
          link: '<https://api.github.test/repos/owner/repo/issues?state=open&labels=docs-publication&per_page=100&page=2>; rel="next"',
        },
      });
    }
    if (String(url).includes('/issues?') && String(url).endsWith('page=2')) {
      return new globalThis.Response(JSON.stringify([existing]), { status: 200 });
    }
    if (method === 'PATCH' && String(url).endsWith('/issues/77')) {
      return new globalThis.Response(
        JSON.stringify({ ...existing, ...JSON.parse(init.body), state: 'closed' }),
        { status: 200 }
      );
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  const result = await updateDocumentationIncident({
    fetchImpl,
    apiUrl: 'https://api.github.test',
    token: 'test-only-token',
    repository: repo,
    ...incidentInput(50, 'recovered'),
  });
  assert.deepEqual(result, { operation: 'update', issueNumber: 77, state: 'closed' });
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
  assert.ok(calls.some((call) => call.url.endsWith('page=2')));
  assert.equal(
    calls.some((call) => call.url.includes('/comments')),
    false
  );
  assert.equal(calls.at(-1).body.state_reason, 'completed');
  assert.deepEqual(Object.keys(calls.at(-1).body).sort(), [
    'body',
    'labels',
    'state',
    'state_reason',
    'title',
  ]);
});

test('pagination links cannot redirect the scoped token outside the configured API origin', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).endsWith('/labels/docs-publication'))
      return new globalThis.Response('{}', { status: 200 });
    return new globalThis.Response('[]', {
      status: 200,
      headers: { link: '<https://attacker.invalid/issues?page=2>; rel="next"' },
    });
  };
  await assert.rejects(
    updateDocumentationIncident({
      fetchImpl,
      apiUrl: 'https://api.github.test',
      token: 'test-only-token',
      repository: repo,
      ...incidentInput(51),
    }),
    /pagination left the configured API origin/u
  );
  assert.equal(
    requests.some((url) => url.startsWith('https://attacker.invalid/')),
    false
  );
});
