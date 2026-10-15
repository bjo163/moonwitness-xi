import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [outputDirectory] = process.argv.slice(2);
if (!outputDirectory) {
  process.stderr.write('Usage: node scripts/write-docs-metadata.mjs <site-directory>\n');
  process.exit(2);
}

const sha = process.env.SOURCE_SHA;
const ref = process.env.SOURCE_REF;
const runId = process.env.RUN_ID;
const docsOnly = process.env.DOCS_ONLY;
const releaseChangeKind = process.env.RELEASE_CHANGE_KIND;
if (!sha || !/^[0-9a-f]{40}$/i.test(sha) || !ref || !runId) {
  process.stderr.write('SOURCE_SHA (40 hex characters), SOURCE_REF, and RUN_ID are required.\n');
  process.exit(2);
}

const metadata = {
  applicationVersion: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  sourceSha: sha,
  sourceRef: ref,
  runId,
  docsOnly: docsOnly === 'true',
  releaseChangeKind: releaseChangeKind || 'unknown',
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(outputDirectory, 'build-info.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
  {
    flag: 'wx',
  }
);
