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
if (!sha || !/^[0-9a-f]{40}$/i.test(sha) || !ref || !runId) {
  process.stderr.write('SOURCE_SHA (40 hex characters), SOURCE_REF, and RUN_ID are required.\n');
  process.exit(2);
}

const metadata = {
  sourceSha: sha,
  sourceRef: ref,
  runId,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(outputDirectory, 'build-info.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
  {
    flag: 'wx',
  }
);
