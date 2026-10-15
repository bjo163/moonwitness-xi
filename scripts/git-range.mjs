import { execFileSync } from 'node:child_process';

export function resolveCommit(reference) {
  return execFileSync(
    'git',
    ['rev-parse', '--verify', '--quiet', '--end-of-options', `${reference}^{commit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

export function readCommitRange(baseCommit, headCommit) {
  const output = execFileSync(
    'git',
    ['log', '--format=%H%x00%P%x00%s%x00%b%x1e', `${baseCommit}..${headCommit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );

  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, parentList, subject, ...bodyParts] = record.split('\x00');
      return {
        sha,
        parents: parentList ? parentList.trim().split(/\s+/) : [],
        subject,
        body: bodyParts.join('\x00').trim(),
      };
    });
}

export function parseChangedFiles(output) {
  const fields = output.split('\x00').filter(Boolean);
  const changes = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const firstPath = fields[index++];
    if (!firstPath) break;

    if (status.startsWith('R') || status.startsWith('C')) {
      const nextPath = fields[index++];
      changes.push({ status: status[0], path: nextPath, previousPath: firstPath });
    } else {
      changes.push({ status: status[0], path: firstPath });
    }
  }
  return changes;
}

export function readChangedFiles(baseCommit, headCommit) {
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '-M', '-z', baseCommit, headCommit],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return parseChangedFiles(output);
}
