import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { canonicalizeJson } from '@moonwitness/knowledge';
import privateArchiveImportManifestSchema from '../schemas/private-archive-import-manifest.schema.json' with { type: 'json' };
import {
  createJsonSchemaValidator,
  type KnowledgeValidationIssue,
  type KnowledgeValidationResult,
} from '@moonwitness/knowledge';

export type PrivateArchiveSourceKind = 'account_export' | 'user_archive' | 'witness_archive';

export interface PrivateArchiveImportConsent {
  state: 'granted' | 'denied' | 'withdrawn';
  sourceKind: PrivateArchiveSourceKind;
  sourcePath: string;
  sourceSha256: string;
  subjectRef: string;
  authorizedByRef: string;
  authorizedAt: string;
  dataCategories: string[];
  purposes: string[];
  authorizedReviewers: string[];
  intendedDerivedUses: string[];
  publicationScope: 'none' | 'internal_only' | 'reviewed_projection';
  withdrawalPath: string;
  correctionPath: string;
  decisionRef: string;
}

export interface PrivateArchiveImportManifest {
  format: 'moonwitness-private-archive-import/v1';
  manifestId: string;
  recordedAt: string;
  source: {
    kind: PrivateArchiveSourceKind;
    path: string;
    exportedAt: string;
    sha256: string;
    byteLength: number;
  };
  consent: PrivateArchiveImportConsent;
}

export interface PrivateArchiveImportRequest {
  rootDirectory: string;
  workspaceRoot: string;
  sourcePath: string;
  manifestPath: string;
  manifestId: string;
  sourceKind: PrivateArchiveSourceKind;
  exportedAt: string;
  recordedAt: string;
  consent: PrivateArchiveImportConsent;
}

export interface ImportPrivateArchiveRequest extends PrivateArchiveImportRequest {
  sourceRootDirectory: string;
}

export { privateArchiveImportManifestSchema };

const validateSchema = createJsonSchemaValidator(
  privateArchiveImportManifestSchema,
  'does not match the private archive import manifest contract'
);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function semanticIssues(value: unknown): KnowledgeValidationIssue[] {
  if (!isObject(value) || !isObject(value.source) || !isObject(value.consent)) return [];
  const issues: KnowledgeValidationIssue[] = [];
  if (value.source.kind !== value.consent.sourceKind) {
    issues.push({
      path: '/consent/sourceKind',
      keyword: 'const',
      message: 'must match the exact source kind',
    });
  }
  if (value.source.path !== value.consent.sourcePath) {
    issues.push({
      path: '/consent/sourcePath',
      keyword: 'const',
      message: 'must match the exact local source path',
    });
  }
  if (value.source.sha256 !== value.consent.sourceSha256) {
    issues.push({
      path: '/consent/sourceSha256',
      keyword: 'const',
      message: 'must match the exact source checksum',
    });
  }
  return issues;
}

/** Validate manifest structure and source binding only; it does not verify the truth or legal sufficiency of consent. */
export function validatePrivateArchiveImportManifest(value: unknown): KnowledgeValidationResult {
  const structural = validateSchema(value);
  const issues = [...(structural.valid ? [] : structural.issues), ...semanticIssues(value)];
  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}

function safeRelativePath(value: string, label: string): string {
  if (
    path.isAbsolute(value) ||
    /^[a-zA-Z]:/u.test(value) ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new TypeError(`${label} must be a safe relative POSIX path`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new TypeError(`${label} must not contain empty, dot, or parent segments`);
  }
  return segments.join(path.sep);
}

async function resolveRegularFile(
  root: string,
  relativePath: string,
  label: string
): Promise<string> {
  const safePath = safeRelativePath(relativePath, label);
  const absolutePath = path.resolve(root, safePath);
  const fromRoot = path.relative(root, absolutePath);
  if (fromRoot.startsWith(`..${path.sep}`) || fromRoot === '..' || path.isAbsolute(fromRoot)) {
    throw new TypeError(`${label} escapes the local workspace`);
  }

  let current = root;
  for (const segment of fromRoot.split(path.sep)) {
    current = path.join(current, segment);
    const details = await lstat(current);
    if (details.isSymbolicLink()) throw new TypeError(`${label} cannot traverse symbolic links`);
  }
  const details = await lstat(absolutePath);
  if (!details.isFile()) throw new TypeError(`${label} must reference a regular file`);
  return absolutePath;
}

async function resolveExternalDirectory(
  workspacePath: string,
  directoryPath: string,
  label: string
): Promise<string> {
  const candidate = path.resolve(directoryPath);
  const details = await lstat(candidate);
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new TypeError(`${label} must be a real local directory`);
  }
  const [directory, workspace] = await Promise.all([realpath(candidate), realpath(workspacePath)]);
  const relative = path.relative(workspace, directory);
  if (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  ) {
    throw new TypeError(`${label} must be outside the workspace`);
  }
  return directory;
}

async function ensureSafeOutputParent(root: string, destination: string): Promise<void> {
  const relativeParent = path.relative(root, path.dirname(destination));
  let current = root;
  for (const segment of relativeParent === '' ? [] : relativeParent.split(path.sep)) {
    current = path.join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    }
    const details = await lstat(current);
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new TypeError('manifestPath parent directories must be real directories');
    }
  }
}

async function hashFile(filePath: string): Promise<{ sha256: string; byteLength: number }> {
  const hash = createHash('sha256');
  let byteLength = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(bytes);
    byteLength += bytes.byteLength;
  }
  if (byteLength === 0) throw new TypeError('source archive must not be empty');
  return { sha256: hash.digest('hex'), byteLength };
}

/**
 * Record an operator-supplied, source-scoped consent decision for a local archive.
 * This writes metadata only; it never copies or parses the archive contents.
 */
export async function createPrivateArchiveImportManifest(
  request: PrivateArchiveImportRequest
): Promise<PrivateArchiveImportManifest> {
  if (!request.consent || request.consent.state !== 'granted') {
    throw new TypeError('A granted, source-scoped consent decision is required');
  }
  const root = await resolveExternalDirectory(
    request.workspaceRoot,
    request.rootDirectory,
    'rootDirectory'
  );

  const sourceRelativePath = safeRelativePath(request.sourcePath, 'sourcePath');
  const manifestRelativePath = safeRelativePath(request.manifestPath, 'manifestPath');
  if (path.resolve(root, sourceRelativePath) === path.resolve(root, manifestRelativePath)) {
    throw new TypeError('manifestPath must not overwrite the source');
  }
  if (
    request.consent.sourcePath !== request.sourcePath ||
    request.consent.sourceKind !== request.sourceKind
  ) {
    throw new TypeError('Consent must be scoped to the exact local source path and kind');
  }

  const sourceFile = await resolveRegularFile(root, request.sourcePath, 'sourcePath');
  const source = await hashFile(sourceFile);
  if (source.sha256 !== request.consent.sourceSha256) {
    throw new TypeError('Consent source checksum does not match the supplied archive');
  }

  const manifest: PrivateArchiveImportManifest = {
    format: 'moonwitness-private-archive-import/v1',
    manifestId: request.manifestId,
    recordedAt: request.recordedAt,
    source: {
      kind: request.sourceKind,
      path: request.sourcePath,
      exportedAt: request.exportedAt,
      sha256: source.sha256,
      byteLength: source.byteLength,
    },
    consent: request.consent,
  };
  const validation = validatePrivateArchiveImportManifest(manifest);
  if (!validation.valid) {
    throw new TypeError(
      `Private archive manifest is invalid: ${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`
    );
  }

  const destination = path.resolve(root, manifestRelativePath);
  await ensureSafeOutputParent(root, destination);
  await writeFile(destination, `${canonicalizeJson(manifest)}\n`, { flag: 'wx', mode: 0o600 });
  return manifest;
}

/** Copy an approved local archive into external storage and bind its manifest to the copied bytes. */
export async function importPrivateArchive(
  request: ImportPrivateArchiveRequest
): Promise<PrivateArchiveImportManifest> {
  if (!request.consent || request.consent.state !== 'granted') {
    throw new TypeError('A granted, source-scoped consent decision is required');
  }
  if (
    request.consent.sourcePath !== request.sourcePath ||
    request.consent.sourceKind !== request.sourceKind
  ) {
    throw new TypeError('Consent must be scoped to the exact local source path and kind');
  }

  const [sourceRoot, destinationRoot] = await Promise.all([
    resolveExternalDirectory(
      request.workspaceRoot,
      request.sourceRootDirectory,
      'sourceRootDirectory'
    ),
    resolveExternalDirectory(request.workspaceRoot, request.rootDirectory, 'rootDirectory'),
  ]);
  if (sourceRoot === destinationRoot) {
    throw new TypeError('sourceRootDirectory and rootDirectory must be different directories');
  }
  const sourceFile = await resolveRegularFile(sourceRoot, request.sourcePath, 'sourcePath');
  const source = await hashFile(sourceFile);
  if (source.sha256 !== request.consent.sourceSha256) {
    throw new TypeError('Consent source checksum does not match the supplied archive');
  }

  const destination = path.resolve(
    destinationRoot,
    safeRelativePath(request.sourcePath, 'sourcePath')
  );
  await ensureSafeOutputParent(destinationRoot, destination);
  let destinationHandle: Awaited<ReturnType<typeof open>> | undefined;
  let createdDestination = false;
  try {
    destinationHandle = await open(destination, 'wx', 0o600);
    createdDestination = true;
    await pipeline(createReadStream(sourceFile), destinationHandle.createWriteStream());
    destinationHandle = undefined;
    const imported = await hashFile(destination);
    if (imported.sha256 !== source.sha256 || imported.byteLength !== source.byteLength) {
      throw new TypeError('Imported archive checksum does not match the supplied source');
    }
    return await createPrivateArchiveImportManifest(request);
  } catch (error) {
    if (destinationHandle) await destinationHandle.close().catch(() => undefined);
    if (createdDestination) await rm(destination, { force: true });
    throw error;
  }
}
