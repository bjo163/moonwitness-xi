import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalizeJson } from '@moonwitness/knowledge';

export interface DatasetReleaseSnapshot {
  format: 'moonwitness-knowledge-snapshot/v1';
  canonicalization: 'RFC8785';
  hashAlgorithm: 'sha256';
  sha256: string;
}

export interface DatasetReleaseInput {
  datasetId: string;
  version: string;
  createdAt: string;
  ontologyVersion: string;
  corpusVersion: string;
  snapshot: DatasetReleaseSnapshot;
}

export interface DatasetReleaseManifest extends DatasetReleaseInput {
  format: 'moonwitness-dataset-release/v1';
  releaseId: string;
  previousReleaseId: string | null;
}

export interface ActiveDatasetRelease {
  format: 'moonwitness-active-dataset-release/v1';
  datasetId: string;
  releaseId: string;
  activatedAt: string;
}

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const datasetIdPattern = /^[a-z0-9][a-z0-9._-]{0,99}$/u;

function releasePayload(input: DatasetReleaseInput, previousReleaseId: string | null) {
  return {
    format: 'moonwitness-dataset-release/v1' as const,
    ...input,
    previousReleaseId,
  };
}

function releaseDigest(payload: ReturnType<typeof releasePayload>): string {
  return createHash('sha256').update(canonicalizeJson(payload), 'utf8').digest('hex');
}

function releasePath(root: string, datasetId: string, releaseId: string): string {
  return path.join(root, 'datasets', datasetId, 'releases', `${releaseId}.json`);
}

function activePath(root: string, datasetId: string): string {
  return path.join(root, 'datasets', datasetId, 'active.json');
}

function validateInput(input: DatasetReleaseInput): void {
  if (!datasetIdPattern.test(input.datasetId)) throw new TypeError('datasetId is invalid');
  if (!semverPattern.test(input.version))
    throw new TypeError('version must be semantic versioning');
  if (!semverPattern.test(input.ontologyVersion) || !semverPattern.test(input.corpusVersion)) {
    throw new TypeError('ontologyVersion and corpusVersion must be semantic versions');
  }
  if (!Number.isFinite(Date.parse(input.createdAt)))
    throw new TypeError('createdAt must be a date-time');
  if (
    input.snapshot.format !== 'moonwitness-knowledge-snapshot/v1' ||
    input.snapshot.canonicalization !== 'RFC8785' ||
    input.snapshot.hashAlgorithm !== 'sha256' ||
    !digestPattern.test(input.snapshot.sha256)
  ) {
    throw new TypeError('snapshot must be a valid canonical SHA-256 knowledge snapshot');
  }
}

async function assertDirectory(directory: string): Promise<void> {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new TypeError('release store paths cannot traverse symbolic links');
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      await mkdir(directory);
      return;
    }
    throw error;
  }
}

async function ensureDirectoryTree(root: string, segments: readonly string[]): Promise<void> {
  await mkdir(root, { recursive: true });
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new TypeError('release store root must be a real directory');
  }
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    await assertDirectory(current);
  }
}

async function assertExistingPath(
  root: string,
  segments: readonly string[],
  finalKind: 'file' | 'directory'
): Promise<boolean> {
  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new TypeError('release store root must be a real directory');
  }
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    }
    if (info.isSymbolicLink())
      throw new TypeError('release store paths cannot traverse symbolic links');
    const isFinal = index === segments.length - 1;
    if (isFinal ? finalKind === 'file' && !info.isFile() : !info.isDirectory()) {
      throw new TypeError(`release store path must resolve to a regular ${finalKind}`);
    }
    if (isFinal && finalKind === 'directory' && !info.isDirectory()) {
      throw new TypeError('release store path must resolve to a directory');
    }
  }
  return true;
}

async function writeAtomically(destination: string, contents: string): Promise<void> {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { flag: 'wx' });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function readActiveDatasetRelease(
  storeDirectory: string,
  datasetId: string
): Promise<ActiveDatasetRelease | null> {
  if (!datasetIdPattern.test(datasetId)) throw new TypeError('datasetId is invalid');
  const root = path.resolve(storeDirectory);
  if (!(await assertExistingPath(root, ['datasets', datasetId, 'active.json'], 'file')))
    return null;
  const pointer = JSON.parse(
    await readFile(activePath(root, datasetId), 'utf8')
  ) as ActiveDatasetRelease;
  if (
    pointer.format !== 'moonwitness-active-dataset-release/v1' ||
    pointer.datasetId !== datasetId ||
    !digestPattern.test(pointer.releaseId)
  ) {
    throw new TypeError('active release pointer is invalid');
  }
  return pointer;
}

/** Store an immutable, content-addressed release manifest without changing the active release. */
export async function createDatasetRelease(
  storeDirectory: string,
  input: DatasetReleaseInput
): Promise<DatasetReleaseManifest> {
  validateInput(input);
  const root = path.resolve(storeDirectory);
  const current = await readActiveDatasetRelease(root, input.datasetId);
  const payload = releasePayload(input, current?.releaseId ?? null);
  const releaseId = releaseDigest(payload);
  const manifest: DatasetReleaseManifest = { ...payload, releaseId };
  await ensureDirectoryTree(root, ['datasets', input.datasetId, 'releases']);
  try {
    await writeFile(
      releasePath(root, input.datasetId, releaseId),
      `${canonicalizeJson(manifest)}\n`,
      {
        flag: 'wx',
      }
    );
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    if (
      !(await assertExistingPath(
        root,
        ['datasets', input.datasetId, 'releases', `${releaseId}.json`],
        'file'
      ))
    ) {
      throw new TypeError('immutable release manifest disappeared during creation', {
        cause: error,
      });
    }
    const existing = JSON.parse(
      await readFile(releasePath(root, input.datasetId, releaseId), 'utf8')
    ) as DatasetReleaseManifest;
    if (canonicalizeJson(existing) !== canonicalizeJson(manifest)) {
      throw new TypeError('release digest collision or corrupted immutable release manifest', {
        cause: error,
      });
    }
  }
  return manifest;
}

/** Switch the active pointer only to an existing intact release; replacement is an atomic same-directory rename. */
export async function activateDatasetRelease(
  storeDirectory: string,
  datasetId: string,
  releaseId: string,
  activatedAt: string
): Promise<ActiveDatasetRelease> {
  if (!datasetIdPattern.test(datasetId) || !digestPattern.test(releaseId)) {
    throw new TypeError('datasetId or releaseId is invalid');
  }
  if (!Number.isFinite(Date.parse(activatedAt)))
    throw new TypeError('activatedAt must be a date-time');
  const root = path.resolve(storeDirectory);
  if (
    !(await assertExistingPath(
      root,
      ['datasets', datasetId, 'releases', `${releaseId}.json`],
      'file'
    ))
  ) {
    throw new TypeError('release manifest does not exist');
  }
  const manifest = JSON.parse(
    await readFile(releasePath(root, datasetId, releaseId), 'utf8')
  ) as DatasetReleaseManifest;
  const { releaseId: declaredId, ...payload } = manifest;
  if (
    manifest.datasetId !== datasetId ||
    declaredId !== releaseId ||
    releaseDigest(payload) !== releaseId
  ) {
    throw new TypeError('release manifest failed integrity validation');
  }
  await ensureDirectoryTree(root, ['datasets', datasetId]);
  const pointer: ActiveDatasetRelease = {
    format: 'moonwitness-active-dataset-release/v1',
    datasetId,
    releaseId,
    activatedAt,
  };
  await writeAtomically(activePath(root, datasetId), `${canonicalizeJson(pointer)}\n`);
  return pointer;
}
