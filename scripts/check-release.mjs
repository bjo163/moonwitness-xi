import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath, URL as NodeURL } from 'node:url';

const log = (message) => process.stdout.write(`${message}\n`);
const fail = (message) => process.stderr.write(`${message}\n`);
const projectUrl = (path) => new NodeURL(path, import.meta.url);

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag)) {
  fail('Usage: pnpm release:check vMAJOR.MINOR.PATCH[-rc.N]');
  process.exit(1);
}

const root = JSON.parse(await readFile(projectUrl('../package.json'), 'utf8'));
const expected = `v${root.version}`;
if (tag !== expected) {
  fail(`Release tag ${tag} does not match root package version ${expected}.`);
  process.exit(1);
}

const workspaceRoot = projectUrl('../');
const workspacePath = fileURLToPath(workspaceRoot);
const packageDirectories = await readdir(`${workspacePath}/packages/`, {
  withFileTypes: true,
});
const appDirectories = await readdir(`${workspacePath}/apps/`, { withFileTypes: true });
const manifests = [
  ...packageDirectories
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`),
  ...appDirectories.filter((entry) => entry.isDirectory()).map((entry) => `apps/${entry.name}`),
].map((directory) => `${directory}/package.json`);
const existingManifests = [];
for (const path of manifests) {
  try {
    await readFile(`${workspacePath}/${path}`);
    existingManifests.push(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
    throw error;
  }
}

const mismatches = [];
for (const path of existingManifests) {
  const manifest = JSON.parse(await readFile(`${workspacePath}/${path}`, 'utf8'));
  if (manifest.private !== true && manifest.version !== root.version) {
    mismatches.push(`${manifest.name}: ${manifest.version} (expected ${root.version})`);
  }
}
const apiManifest = JSON.parse(await readFile(`${workspacePath}/apps/api/package.json`, 'utf8'));
if (apiManifest.version !== root.version) {
  mismatches.push(`@moonwitness/api: ${apiManifest.version} (expected ${root.version})`);
}

if (mismatches.length > 0) {
  fail('Workspace release versions do not match:');
  for (const mismatch of mismatches) fail(`- ${mismatch}`);
  process.exit(1);
}

log(`Release ${tag} is consistent across the workspace.`);
