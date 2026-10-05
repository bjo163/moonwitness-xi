import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL as NodeURL } from 'node:url';

const repositoryRoot = fileURLToPath(new NodeURL('../', import.meta.url));
const githubDirectory = join(repositoryRoot, '.github');
const immutableSha = /^[0-9a-f]{40}$/;
const versionComment = /^v?\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9.-]+)?$/;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (/\.(?:yml|yaml)$/.test(entry.name)) files.push(path);
  }
  return files;
}

export function findUnpinnedActions(sources) {
  const findings = [];
  for (const source of sources) {
    const lines = source.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^\s*(?:-\s*)?uses:\s*(?<value>.*?)\s*$/.exec(lines[index]);
      if (!match?.groups) continue;
      const [reference, commentText = ''] = match.groups.value.split(/\s+#\s*/, 2);
      if (reference.startsWith('./')) continue;
      const [action, revision] = reference.split('@');
      const comment = commentText.trim();
      if (!action.includes('/') || !revision || !immutableSha.test(revision)) {
        findings.push({
          path: source.path,
          line: index + 1,
          reference,
          reason: 'must pin a full 40-character commit SHA',
        });
        continue;
      }
      if (!versionComment.test(comment)) {
        findings.push({
          path: source.path,
          line: index + 1,
          reference,
          reason: 'must include the human-readable action version after the SHA',
        });
      }
    }
  }
  return findings;
}

async function main() {
  const paths = await collectFiles(githubDirectory);
  const sources = await Promise.all(
    paths.map(async (path) => ({
      path: relative(repositoryRoot, path).replaceAll('\\', '/'),
      content: await readFile(path, 'utf8'),
    }))
  );
  const findings = findUnpinnedActions(sources);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.path}:${finding.line}: ${finding.reference} ${finding.reason}\n`
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Validated immutable external action references in ${paths.length} GitHub workflow/composite files.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
