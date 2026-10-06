import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const githubDirectory = join(repositoryRoot, '.github');
const immutableSha = /^[0-9a-f]{40}$/u;
const versionTag = /^v?\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9.-]+)?$/u;

export async function collectWorkflowSources(directory = githubDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectWorkflowSources(path)));
    else if (/\.(?:yml|yaml)$/u.test(entry.name)) {
      files.push({
        path: relative(repositoryRoot, path).replaceAll('\\', '/'),
        content: await readFile(path, 'utf8'),
      });
    }
  }
  return files;
}

export function collectActionPins(sources) {
  const pins = [];
  for (const source of sources) {
    const lines = source.content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^\s*(?:-\s*)?uses:\s*(?<value>.*?)\s*$/u.exec(lines[index] ?? '');
      if (!match?.groups) continue;
      const [reference, comment = ''] = match.groups.value.split(/\s+#\s*/u, 2);
      if (reference.startsWith('./')) continue;
      const separator = reference.lastIndexOf('@');
      if (separator < 0) continue;
      const action = reference.slice(0, separator);
      const sha = reference.slice(separator + 1);
      const version = comment.trim();
      if (!action.includes('/') || !immutableSha.test(sha) || !versionTag.test(version)) continue;
      pins.push({ action, sha, version, path: source.path, line: index + 1 });
    }
  }
  return pins;
}

export async function verifyActionPinTargets(pins, resolveTag) {
  const resolved = new Map();
  const findings = [];
  for (const pin of pins) {
    const key = `${pin.action}@${pin.version}`;
    if (!resolved.has(key)) {
      let tagRefs = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          tagRefs = await resolveTag(pin.action, pin.version);
          break;
        } catch {
          if (attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      resolved.set(key, tagRefs);
    }
    const tagRefs = resolved.get(key);
    const actualSha =
      typeof tagRefs === 'object' && tagRefs !== null
        ? tagRefs.tagSha === pin.sha
          ? tagRefs.tagSha
          : tagRefs.peeledSha === pin.sha
            ? tagRefs.peeledSha
            : (tagRefs.peeledSha ?? tagRefs.tagSha ?? null)
        : tagRefs;
    if (!actualSha) {
      findings.push({ ...pin, reason: 'upstream version tag could not be resolved' });
    } else if (typeof actualSha === 'string' && actualSha !== pin.sha) {
      findings.push({ ...pin, actualSha, reason: 'SHA does not match the upstream version tag' });
    }
  }
  return findings;
}

export function resolveUpstreamTag(action, version) {
  const repository = action.split('/').slice(0, 2).join('/');
  const tagRef = `refs/tags/${version}`;
  const peeledRef = `${tagRef}^{}`;
  const output = execFileSync(
    'git',
    ['ls-remote', `https://github.com/${repository}.git`, tagRef, peeledRef],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000, windowsHide: true }
  );
  const refs = new Map(
    output
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split(/\s+/u);
        return [ref, sha];
      })
  );
  const tagSha = refs.get(tagRef);
  const peeledSha = refs.get(peeledRef);
  return { tagSha, peeledSha };
}

async function main() {
  const files = await collectWorkflowSources(githubDirectory);
  const pins = collectActionPins(files);
  const findings = await verifyActionPinTargets(pins, resolveUpstreamTag);
  if (findings.length > 0) {
    for (const finding of findings) {
      const detail = finding.actualSha ? ` (upstream ${finding.actualSha})` : '';
      process.stderr.write(
        `${finding.path}:${finding.line}: ${finding.action}@${finding.version} ${finding.reason}${detail}\n`
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Verified ${pins.length} immutable GitHub Action references against their upstream version tags.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write('Unable to read workflow sources or validate upstream action tags.\n');
    process.exitCode = 1;
  });
}
