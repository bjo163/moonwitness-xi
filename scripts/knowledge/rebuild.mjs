#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readQuranPassage, readTextualWitnessPassage } from '../../packages/corpus/dist/index.js';

const usage =
  'Usage: node scripts/knowledge/rebuild.mjs --root <local-source-root> --output <empty-output-directory>';
const sourceDefinitions = [
  {
    kind: 'quran-passage',
    indexPath: 'corpus/manifests/quran-passage-index.json',
    read: async (rootDirectory, entry) =>
      readQuranPassage({
        rootDirectory,
        editionId: entry.edition_id,
        locator: entry.locator,
        use: 'store',
      }),
    identity: (entry, passage) => ({
      kind: 'quran-passage',
      sourceId: 'mw:source:tanzil-quran-text',
      editionId: passage.editionId,
      locator: passage.locator,
    }),
  },
  {
    kind: 'textual-witness',
    indexPath: 'corpus/manifests/textual-witness-index.json',
    read: async (rootDirectory, entry) =>
      readTextualWitnessPassage({
        rootDirectory,
        expressionId: entry.expression_id,
        editionId: entry.edition_id,
        locator: entry.locator,
      }),
    identity: (entry, passage) => ({
      kind: 'textual-witness',
      sourceId: passage.sourceId,
      expressionId: passage.expressionId,
      editionId: passage.editionId,
      locator: passage.locator,
    }),
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArguments(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if ((option !== '--root' && option !== '--output') || !value || value.startsWith('--')) {
      throw new TypeError(usage);
    }
    const key = option === '--root' ? 'rootDirectory' : 'outputDirectory';
    if (parsed[key]) throw new TypeError(`Duplicate option: ${option}`);
    parsed[key] = value;
    index += 1;
  }
  if (!parsed.rootDirectory || !parsed.outputDirectory) throw new TypeError(usage);
  return {
    rootDirectory: path.resolve(parsed.rootDirectory),
    outputDirectory: path.resolve(parsed.outputDirectory),
  };
}

async function ensureEmptyOutput(directory) {
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new TypeError('Output must be a real directory');
    }
    if ((await readdir(directory)).length !== 0) {
      throw new TypeError('Output directory must be empty for a clean rebuild');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(directory, { recursive: true });
  }
}

async function readManifestBytes(rootDirectory, manifestPath) {
  if (
    typeof manifestPath !== 'string' ||
    manifestPath.length === 0 ||
    path.isAbsolute(manifestPath) ||
    manifestPath.includes('\\') ||
    manifestPath.includes('\0') ||
    manifestPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new TypeError('Source manifest path must be a safe relative POSIX path');
  }
  const segments = manifestPath.split('/');
  let current = rootDirectory;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink())
      throw new TypeError('Source manifest cannot traverse symbolic links');
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw new TypeError('Source manifest parents must be directories');
    }
    if (index === segments.length - 1 && !info.isFile()) {
      throw new TypeError('Source manifest must be a regular file');
    }
  }
  return readFile(current);
}

async function resolvedPathForNewTarget(target) {
  let existing = target;
  const suffix = [];
  while (true) {
    try {
      await lstat(existing);
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
  return path.join(await realpath(existing), ...suffix);
}

async function readIndex(rootDirectory, indexPath) {
  const bytes = await readFile(path.join(rootDirectory, indexPath));
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || !Array.isArray(value.entries)) throw new TypeError(`Invalid index: ${indexPath}`);
  return { bytes, entries: value.entries, sourceIndex: { path: indexPath, sha256: sha256(bytes) } };
}

async function materializeSource(rootDirectory, outputDirectory, definition, entry) {
  const sourceManifestBytes = await readManifestBytes(rootDirectory, entry.source_manifest_path);
  const passage = await definition.read(rootDirectory, entry);
  const sourceManifest = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(sourceManifestBytes)
  );
  const artifactBytes = passage.originalBytes;
  const digest = sha256(artifactBytes);
  if (digest !== entry.sha256 || digest !== passage.sha256) {
    throw new TypeError('Verified passage bytes do not match the pinned source digest');
  }

  // The corpus reader validates this manifest too. Confirm it did not change between
  // the reader's validation and our read before copying it into the reconstruction.
  const manifestAfterRead = await readManifestBytes(rootDirectory, entry.source_manifest_path);
  if (!manifestAfterRead.equals(sourceManifestBytes)) {
    throw new TypeError('Source manifest changed during reconstruction');
  }

  const manifestSha256 = sha256(sourceManifestBytes);
  const manifestRelative = `source-manifests/${manifestSha256}.json`;
  const artifactRelative = `artifacts/sha256/${digest.slice(0, 2)}/${digest}`;
  for (const relativePath of [manifestRelative, artifactRelative]) {
    const destination = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      destination,
      relativePath === manifestRelative ? sourceManifestBytes : artifactBytes,
      {
        flag: 'wx',
      }
    );
  }

  return {
    ...definition.identity(entry, passage),
    sha256: digest,
    byteLength: artifactBytes.byteLength,
    manifestSha256,
    rightsState: sourceManifest.rights.state,
    allowedUses: [...sourceManifest.rights.allowed_uses].sort(compareText),
    manifestPath: manifestRelative,
    artifactPath: artifactRelative,
    attribution: passage.attribution,
    status: 'imported',
  };
}

export async function rebuildLocalCorpus({ rootDirectory, outputDirectory }) {
  const root = await realpath(path.resolve(rootDirectory));
  const output = path.resolve(outputDirectory);
  const resolvedOutput = await resolvedPathForNewTarget(output);
  const outputRelativeToRoot = path.relative(root, resolvedOutput);
  const outputIsOutsideRoot =
    outputRelativeToRoot === '..' ||
    outputRelativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(outputRelativeToRoot);
  if (!outputIsOutsideRoot) {
    throw new TypeError('Output directory must be outside the source root');
  }
  await ensureEmptyOutput(output);

  const indexes = await Promise.all(
    sourceDefinitions.map(async (definition) => ({
      definition,
      ...(await readIndex(root, definition.indexPath)),
    }))
  );
  const sourceIndexes = [];
  for (const { definition, bytes, sourceIndex } of indexes) {
    const relativePath = `indexes/${path.posix.basename(definition.indexPath)}`;
    await mkdir(path.dirname(path.join(output, relativePath)), { recursive: true });
    await writeFile(path.join(output, relativePath), bytes, { flag: 'wx' });
    sourceIndexes.push({ ...sourceIndex, outputPath: relativePath });
  }
  const imported = [];
  const errors = [];
  for (const { definition, entries } of indexes) {
    for (const entry of entries) {
      try {
        imported.push(await materializeSource(root, output, definition, entry));
      } catch (error) {
        errors.push({
          kind: definition.kind,
          locator: typeof entry?.locator === 'string' ? entry.locator : null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  imported.sort(
    (left, right) => compareText(left.kind, right.kind) || compareText(left.locator, right.locator)
  );
  errors.sort(
    (left, right) =>
      compareText(left.kind, right.kind) || compareText(String(left.locator), String(right.locator))
  );
  const report = {
    format: 'moonwitness-corpus-rebuild-report/v1',
    mode: 'local-only',
    sourceIndexes: sourceIndexes.sort((left, right) => compareText(left.path, right.path)),
    summary: {
      indexed: indexes.reduce((total, index) => total + index.entries.length, 0),
      imported: imported.length,
      errors: errors.length,
    },
    sources: imported,
    importErrors: errors,
  };
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'source-reconstruction.json'), reportBytes, { flag: 'wx' });
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await rebuildLocalCorpus(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.summary.errors > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
