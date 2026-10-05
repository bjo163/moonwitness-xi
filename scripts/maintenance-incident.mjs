import process from 'node:process';
import { pathToFileURL } from 'node:url';

const CATEGORIES = {
  'docs-publication': {
    label: 'docs-publication',
    marker: 'docs-publication',
    title: 'Documentation publication incident',
    subject: 'Documentation publication',
    description:
      'static documentation build or GitHub Pages publication; it is not an application release signal',
    steps: [
      'Inspect the linked workflow run and correct the documentation build, validation, or Pages permission failure.',
      'Retry the trusted Pages workflow from `main` or a verified release tag.',
      'A successful trusted publication updates this issue and resolves only this `docs-publication` incident.',
    ],
  },
  'platform-audit': {
    label: 'platform-audit',
    marker: 'platform-audit',
    title: 'Monthly platform audit incident',
    subject: 'Monthly platform audit',
    description: 'monthly read-only GitHub platform inventory and retention audit',
    steps: [
      'Inspect the linked workflow run and identify the failing inventory, summary, or baseline-artifact step.',
      'Correct the workflow or audit script and rerun the trusted workflow from `main`.',
      'A successful audit with its baseline artifact updates this issue and resolves only this `platform-audit` incident.',
    ],
  },
};
const MAX_RUNS = 10;

function categoryConfig(category) {
  const config = CATEGORIES[category];
  if (!config) throw new Error(`Unsupported maintenance incident category: ${category}`);
  return config;
}

function escapeCode(value) {
  return value.replaceAll('`', '\\`').replaceAll('\n', ' ');
}

function issueHasLabel(issue, expected) {
  return (issue.labels ?? []).some((label) =>
    typeof label === 'string'
      ? label.toLowerCase() === expected
      : label?.name?.toLowerCase() === expected
  );
}

function managedBlock(body, begin, end) {
  const start = body.indexOf(begin);
  const endIndex = body.indexOf(end);
  if (start === -1 && endIndex === -1) return { block: null, prefix: body, suffix: '' };
  if (
    start === -1 ||
    endIndex === -1 ||
    endIndex < start ||
    body.indexOf(begin, start + begin.length) !== -1 ||
    body.indexOf(end, endIndex + end.length) !== -1
  ) {
    throw new Error('Maintenance incident issue has malformed managed-block markers');
  }
  return {
    block: body.slice(start + begin.length, endIndex).trim(),
    prefix: body.slice(0, start),
    suffix: body.slice(endIndex + end.length),
  };
}

function recentRuns(block, runMarker) {
  if (!block) return [];
  const lines = block.split('\n').filter((line) => runMarker.test(line));
  const seen = new Set();
  return lines
    .filter((line) => {
      const match = line.match(runMarker);
      if (!match || seen.has(match[1])) return false;
      seen.add(match[1]);
      return true;
    })
    .slice(0, MAX_RUNS);
}

function renderBlock({ category, status, sourceRef, sourceSha, runUrl, runId, previousBlock }) {
  const config = categoryConfig(category);
  const begin = `<!-- moonwitness:${config.marker}:begin -->`;
  const end = `<!-- moonwitness:${config.marker}:end -->`;
  const runMarker = new RegExp(`<!-- moonwitness:${config.marker}-run:(\\d+) -->`, 'u');
  const failures = recentRuns(previousBlock, runMarker);
  const currentLine = `- Failure: [run #${runId}](${runUrl}) — ref \`${escapeCode(sourceRef)}\`, SHA \`${sourceSha}\`. <!-- moonwitness:${config.marker}-run:${runId} -->`;
  const allRuns =
    status === 'failed'
      ? [currentLine, ...failures.filter((line) => !line.includes(`run:${runId} `))].slice(
          0,
          MAX_RUNS
        )
      : failures;
  const history = allRuns.length ? allRuns.join('\n') : '- No failed publication run is recorded.';
  const recovery =
    status === 'recovered'
      ? `\n\n## Recovery\n\n${config.subject} completed successfully from ref \`${escapeCode(sourceRef)}\`, SHA \`${sourceSha}\` ([run #${runId}](${runUrl})). This incident is resolved.`
      : '';
  return [
    begin,
    `## ${config.subject} incident — ${status === 'recovered' ? 'RECOVERED' : 'OPEN'}`,
    '',
    `This issue tracks failures in the ${config.description}.`,
    '',
    '### Recent failed attempts (newest first; capped at 10)',
    '',
    history,
    '',
    '### Recovery steps',
    '',
    ...config.steps.map((step, index) => `${index + 1}. ${step}`),
    recovery,
    end,
  ].join('\n');
}

function composeBody(existingBody, block, begin, end) {
  const current = managedBlock(existingBody, begin, end);
  const prefix = current.prefix.trimEnd();
  const suffix = current.suffix.trimStart();
  return [prefix, block, suffix].filter(Boolean).join('\n\n');
}

export function planMaintenanceIncident({
  category,
  issues,
  status,
  sourceRef,
  sourceSha,
  runUrl,
  runId,
}) {
  const config = categoryConfig(category);
  const begin = `<!-- moonwitness:${config.marker}:begin -->`;
  const end = `<!-- moonwitness:${config.marker}:end -->`;
  if (status !== 'failed' && status !== 'recovered') throw new Error('Invalid incident status');
  if (!Array.isArray(issues)) throw new Error('Issues must be an array');
  if (typeof sourceRef !== 'string' || sourceRef.length < 1 || sourceRef.length > 200)
    throw new Error('Invalid source ref');
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40,64}$/u.test(sourceSha))
    throw new Error('Invalid source SHA');
  if (!/^[1-9]\d{0,19}$/u.test(String(runId))) throw new Error('Invalid workflow run ID');
  const parsedRunUrl = new globalThis.URL(runUrl);
  if (
    parsedRunUrl.protocol !== 'https:' ||
    !/^\/[^/]+\/[^/]+\/actions\/runs\/[1-9]\d*$/u.test(parsedRunUrl.pathname) ||
    !parsedRunUrl.pathname.endsWith(`/actions/runs/${runId}`)
  ) {
    throw new Error('Invalid workflow run URL');
  }

  const matching = issues.filter(
    (issue) => issue.state === 'open' && !issue.pull_request && issueHasLabel(issue, config.label)
  );
  if (matching.length > 1) {
    return {
      operation: 'conflict',
      reason: `Found ${matching.length} open ${config.subject.toLowerCase()} incidents.`,
    };
  }
  const existing = matching[0];
  if (!existing && status === 'recovered')
    return { operation: 'noop', reason: 'No open documentation publication incident exists.' };

  const current = existing ? managedBlock(existing.body ?? '', begin, end) : { block: null };
  const block = renderBlock({
    category,
    status,
    sourceRef,
    sourceSha,
    runUrl,
    runId,
    previousBlock: current.block,
  });
  const body = composeBody(existing?.body ?? '', block, begin, end);
  if (!existing) {
    return {
      operation: 'create',
      title: config.title,
      body,
      labels: [config.label],
      state: 'open',
    };
  }

  const labels = [
    ...new Set([
      ...(existing.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
      config.label,
    ]),
  ];
  const state = status === 'recovered' ? 'closed' : 'open';
  const unchanged =
    existing.body === body &&
    existing.state === state &&
    JSON.stringify(
      [...(existing.labels ?? [])]
        .map((label) => (typeof label === 'string' ? label : label.name))
        .sort()
    ) === JSON.stringify(labels.slice().sort());
  if (unchanged)
    return {
      operation: 'noop',
      issueNumber: existing.number,
      reason: 'Incident already reflects this state.',
    };
  return {
    operation: 'update',
    issueNumber: existing.number,
    title: existing.title,
    body,
    labels,
    state,
    state_reason: status === 'recovered' ? 'completed' : undefined,
  };
}

export function planDocumentationIncident(input) {
  return planMaintenanceIncident({ ...input, category: 'docs-publication' });
}

function paginationNext(linkHeader) {
  for (const part of (linkHeader ?? '').split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/u);
    if (match) return match[1];
  }
  return null;
}

export async function updateMaintenanceIncident({
  fetchImpl = globalThis.fetch,
  apiUrl = 'https://api.github.com',
  token,
  repository,
  category,
  ...input
}) {
  const config = categoryConfig(category);
  if (typeof token !== 'string' || token.length === 0) throw new Error('GITHUB_TOKEN is required');
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository))
    throw new Error('Invalid repository');
  const apiBase = new globalThis.URL(apiUrl);
  if (apiBase.protocol !== 'https:') throw new Error('GitHub API URL must use HTTPS');
  const base = `${apiUrl.replace(/\/$/u, '')}/repos/${repository}`;
  const request = async (url, method = 'GET', body) => {
    const response = await fetchImpl(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(`GitHub API ${method} request failed with HTTP ${response.status}`);
    return {
      data: response.status === 204 ? null : await response.json(),
      headers: response.headers,
    };
  };

  let label = await fetchImpl(`${base}/labels/${config.label}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` },
  });
  if (label.status === 404) {
    label = await fetchImpl(`${base}/labels`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: config.label,
        color: '1D76DB',
        description: `${config.subject} status`,
      }),
    });
    if (!label.ok && label.status !== 422)
      throw new Error(`GitHub API label creation failed with HTTP ${label.status}`);
  } else if (!label.ok) {
    throw new Error(`GitHub API label lookup failed with HTTP ${label.status}`);
  }

  const issues = [];
  let url = `${base}/issues?state=open&labels=${config.label}&per_page=100&page=1`;
  while (url) {
    const pageUrl = new globalThis.URL(url, base);
    if (pageUrl.origin !== apiBase.origin)
      throw new Error('GitHub API pagination left the configured API origin');
    const page = await request(pageUrl.href);
    if (!Array.isArray(page.data)) throw new Error('GitHub API returned an invalid issue page');
    issues.push(...page.data);
    const next = paginationNext(page.headers.get('link'));
    if (next) {
      const nextUrl = new globalThis.URL(next, pageUrl);
      if (nextUrl.origin !== apiBase.origin)
        throw new Error('GitHub API pagination left the configured API origin');
      url = nextUrl.href;
    } else {
      url = null;
    }
  }
  const plan = planMaintenanceIncident({ category, issues, ...input });
  if (plan.operation === 'conflict' || plan.operation === 'noop') return plan;
  const endpoint =
    plan.operation === 'create' ? `${base}/issues` : `${base}/issues/${plan.issueNumber}`;
  const payload = Object.fromEntries(
    ['title', 'body', 'labels', 'state', 'state_reason']
      .filter((key) => plan[key] !== undefined)
      .map((key) => [key, plan[key]])
  );
  const { data } = await request(endpoint, plan.operation === 'create' ? 'POST' : 'PATCH', payload);
  return {
    operation: plan.operation,
    issueNumber: data?.number ?? plan.issueNumber,
    state: data?.state ?? plan.state,
  };
}

export function updateDocumentationIncident(input) {
  return updateMaintenanceIncident({ ...input, category: 'docs-publication' });
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const sourceRef = process.env.SOURCE_REF || process.env.EVENT_REF_NAME;
  const runId = process.env.RUN_ID;
  const runUrl = `${server}/${repository}/actions/runs/${runId}`;
  const category = process.env.INCIDENT_CATEGORY ?? 'docs-publication';
  const result = await updateMaintenanceIncident({
    token: process.env.GITHUB_TOKEN,
    repository,
    category,
    status: process.env.INCIDENT_STATUS,
    sourceRef,
    sourceSha: process.env.SOURCE_SHA,
    runId,
    runUrl,
    apiUrl: process.env.GITHUB_API_URL,
  });
  if (result.operation === 'conflict') throw new Error(result.reason);
  globalThis.console.log(
    `${category} incident ${result.operation}${result.issueNumber ? ` #${result.issueNumber}` : ''}${result.state ? ` (${result.state})` : ''}.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    globalThis.console.error(
      error instanceof Error ? error.message : 'Documentation incident update failed'
    );
    process.exitCode = 1;
  });
}
