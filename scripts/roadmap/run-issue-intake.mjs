import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { planAuthorizedGitHubIssueComment } from './github-issue-intake.mjs';

const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
const repositoryId = process.env.GITHUB_REPOSITORY_ID;
const token = process.env.GITHUB_TOKEN;

if (!eventPath || !repository || !repositoryId || !token) {
  throw new Error('GitHub event path, repository identity and token are required.');
}

const [owner, repo, extra] = repository.split('/');
if (!owner || !repo || extra !== undefined) throw new Error('GITHUB_REPOSITORY is invalid.');

const payload = JSON.parse(await readFile(eventPath, 'utf8'));
const result = await planAuthorizedGitHubIssueComment({
  payload,
  expectedRepositoryId: repositoryId,
  owner,
  repo,
  token,
});

const report =
  result.disposition === 'proposal'
    ? {
        disposition: result.disposition,
        deliveryId: result.deliveryId,
        kind: result.proposal.kind,
        taskId: result.proposal.taskId,
        issueNumber: result.proposal.issueNumber,
        actor: result.proposal.actor,
        ...('requestedStatus' in result.proposal
          ? { requestedStatus: result.proposal.requestedStatus }
          : {}),
        ...('requestedAction' in result.proposal
          ? { requestedAction: result.proposal.requestedAction }
          : {}),
        sourceSha: process.env.GITHUB_SHA,
      }
    : { disposition: result.disposition, reason: result.reason };

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
