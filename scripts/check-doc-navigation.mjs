import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const navigationFile = path.join(root, 'docs/guide/navigation.json');
const allowedKinds = new Set(['tutorial', 'how-to', 'reference', 'explanation']);

export async function validateNavigation(navigation, fileExists) {
  const errors = [];
  if (navigation?.schemaVersion !== 1 || typeof navigation.title !== 'string') {
    errors.push('Navigation requires schemaVersion 1 and a title.');
  }
  if (!Array.isArray(navigation?.sections) || navigation.sections.length === 0) {
    errors.push('Navigation must contain at least one section.');
    return errors;
  }

  const seenPaths = new Set();
  for (const section of navigation.sections) {
    if (typeof section?.title !== 'string' || !section.title.trim()) {
      errors.push('Every navigation section needs a title.');
    }
    if (!Array.isArray(section?.items) || section.items.length === 0) {
      errors.push(`Navigation section '${section?.title ?? ''}' must contain at least one item.`);
      continue;
    }
    for (const item of section.items) {
      if (
        typeof item?.title !== 'string' ||
        !item.title.trim() ||
        !allowedKinds.has(item.kind) ||
        typeof item.path !== 'string'
      ) {
        errors.push(`Invalid navigation item in section '${section.title}'.`);
        continue;
      }
      const normalizedPath = item.path.replaceAll('\\', '/');
      const segments = normalizedPath.split('/');
      if (
        segments[0] !== 'docs' ||
        segments.some((segment) => segment === '..' || segment === '.') ||
        path.posix.isAbsolute(normalizedPath)
      ) {
        errors.push(`Navigation path must stay under docs/: ${item.path}`);
        continue;
      }
      if (seenPaths.has(normalizedPath)) errors.push(`Duplicate navigation path: ${item.path}`);
      seenPaths.add(normalizedPath);
      if (!(await fileExists(normalizedPath))) {
        errors.push(`Navigation target does not exist: ${normalizedPath}`);
      }
    }
  }
  return errors;
}

async function main() {
  let navigation;
  try {
    navigation = JSON.parse(await readFile(navigationFile, 'utf8'));
  } catch (error) {
    process.stderr.write(`Could not read docs navigation: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  const errors = await validateNavigation(navigation, async (relativePath) => {
    try {
      return (await stat(path.join(root, ...relativePath.split('/')))).isFile();
    } catch {
      return false;
    }
  });
  if (errors.length > 0) {
    process.stderr.write(
      `Invalid docs navigation:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
    );
    process.exitCode = 1;
    return;
  }
  const targetCount = navigation.sections.reduce(
    (total, section) => total + section.items.length,
    0
  );
  process.stdout.write(
    `Validated ${navigation.sections.length} documentation sections and ${targetCount} navigation targets.\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
