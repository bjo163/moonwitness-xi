const taskIdPattern = /^M(?:0|[1-9][0-9]*)\.[0-9]{2}$/u;
const markerPattern =
  /^<!-- moonwitness-task: ([1-9][0-9]*):(M(?:0|[1-9][0-9]*)\.[0-9]{2}) -->$/gmu;
const commandPattern = /^\/mw (status|scope|close|reopen)(?: ([a-z_]+))? -- ([\s\S]{1,2000})$/u;

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function positiveSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Turn a raw GitHub `issue_comment` webhook payload into the inert event schema
 * accepted by `planMaintainerIssueIntake`. GitHub Actions authenticates the
 * webhook delivery; this adapter performs shape/identity checks only and has
 * no network or mutation capability.
 *
 * @param {{payload: unknown, expectedRepositoryId: string}} input
 * @returns {{disposition: 'event', event: Record<string, unknown>} | {disposition: 'ignored'|'rejected', reason: string}}
 */
export function normalizeGitHubIssueComment({ payload, expectedRepositoryId }) {
  if (typeof expectedRepositoryId !== 'string' || !/^[1-9][0-9]*$/u.test(expectedRepositoryId))
    return { disposition: 'rejected', reason: 'invalid-expected-repository-id' };
  const root = record(payload);
  if (!root) return { disposition: 'rejected', reason: 'invalid-payload' };
  if (root.action !== 'created')
    return { disposition: 'ignored', reason: 'unsupported-event-action' };

  const repository = record(root.repository);
  const issue = record(root.issue);
  const comment = record(root.comment);
  const actor = record(comment?.user);
  const repositoryId = repository?.id;
  if (!positiveSafeInteger(repositoryId) || String(repositoryId) !== expectedRepositoryId)
    return { disposition: 'ignored', reason: 'repository-mismatch' };
  if (!positiveSafeInteger(issue?.number) || !positiveSafeInteger(comment?.id))
    return { disposition: 'rejected', reason: 'invalid-github-identity' };
  if (record(issue?.pull_request)) return { disposition: 'ignored', reason: 'pull-request' };
  if (actor?.type === 'Bot') return { disposition: 'ignored', reason: 'bot-echo' };
  if (typeof actor?.login !== 'string' || actor.login.trim().length === 0)
    return { disposition: 'rejected', reason: 'invalid-actor' };
  if (typeof issue?.body !== 'string')
    return { disposition: 'rejected', reason: 'missing-issue-body' };

  const markers = [...issue.body.matchAll(markerPattern)];
  if (markers.length !== 1 || markers[0][1] !== expectedRepositoryId)
    return { disposition: 'ignored', reason: 'unmanaged-or-ambiguous-issue' };
  const taskId = markers[0][2];
  if (!taskIdPattern.test(taskId)) return { disposition: 'rejected', reason: 'invalid-task-id' };

  if (typeof comment.body !== 'string')
    return { disposition: 'rejected', reason: 'invalid-comment' };
  const command = commandPattern.exec(comment.body);
  if (!command) return { disposition: 'ignored', reason: 'not-an-intake-command' };
  const [, action, argument, rationale] = command;
  if ((action === 'status' && !argument) || (action !== 'status' && argument))
    return { disposition: 'rejected', reason: 'invalid-command-arguments' };

  return {
    disposition: 'event',
    event: {
      repositoryId: expectedRepositoryId,
      deliveryId: `issue_comment_${comment.id}`,
      issueNumber: issue.number,
      taskId,
      actor: actor.login,
      isBot: false,
      pullRequest: false,
      action,
      rationale,
      ...(action === 'status' ? { status: argument } : {}),
      ...(action === 'scope' ? { proposal: rationale } : {}),
    },
  };
}
