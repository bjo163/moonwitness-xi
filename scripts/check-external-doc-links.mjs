import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listMarkdownFiles, stripFencedCode } from './check-docs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const externalPattern = /!?\[[^\]]*\]\((<https?:\/\/[^>]+>|https?:\/\/[^)\s]+)/giu;

export function extractExternalDocumentationUrls(markdown) {
  const source = stripFencedCode(markdown);
  return [
    ...new Set(
      [...source.matchAll(externalPattern)].map((match) => match[1].replace(/^<|>$/gu, ''))
    ),
  ];
}

export async function checkExternalUrls(
  urls,
  fetchImpl = globalThis.fetch,
  { attempts = 3, delayMs = 500 } = {}
) {
  const failures = [];
  for (const url of [...new Set(urls)].sort()) {
    let lastResult = 'no response';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: globalThis.AbortSignal.timeout(12000),
          headers: { 'user-agent': 'MoonWitness-Docs-Link-Check/1.0' },
        });
        if (response.status >= 200 && response.status < 400) {
          lastResult = '';
          break;
        }
        if (response.status === 403 || response.status === 405) {
          const fallback = await fetchImpl(url, {
            method: 'GET',
            redirect: 'follow',
            signal: globalThis.AbortSignal.timeout(12000),
            headers: { range: 'bytes=0-0', 'user-agent': 'MoonWitness-Docs-Link-Check/1.0' },
          });
          if (fallback.status >= 200 && fallback.status < 400) {
            lastResult = '';
            break;
          }
          lastResult = `HTTP ${fallback.status}`;
        } else {
          lastResult = `HTTP ${response.status}`;
        }
      } catch (error) {
        lastResult = error instanceof Error ? error.message : String(error);
      }
      if (attempt < attempts) await delay(delayMs * attempt);
    }
    if (lastResult) failures.push(`${url}: ${lastResult} after ${attempts} attempt(s)`);
  }
  return failures;
}

export async function runExternalDocumentationCheck(
  repositoryRoot = root,
  fetchImpl = globalThis.fetch
) {
  const scope = ['docs/guide', 'docs/design', 'docs/engineering'];
  const files = (
    await Promise.all(
      scope.map((directory) => listMarkdownFiles(path.join(repositoryRoot, directory)))
    )
  ).flat();
  const urls = new Set();
  for (const file of files) {
    for (const url of extractExternalDocumentationUrls(await readFile(file, 'utf8'))) urls.add(url);
  }
  const failures = await checkExternalUrls(urls, fetchImpl);
  if (failures.length)
    throw new Error(
      `Unreachable external documentation links (${failures.length}):\n${failures.join('\n')}`
    );
  return urls.size;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runExternalDocumentationCheck()
    .then((count) => process.stdout.write(`Verified ${count} external documentation links.\n`))
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'External documentation link check failed'}\n`
      );
      process.exitCode = 1;
    });
}
