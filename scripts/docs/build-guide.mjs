import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const navigationPath = path.join(root, 'docs/guide/navigation.json');
const metadataPath = path.join(root, 'docs/guide/reference/generated-platform.json');
const outputPath = path.join(root, 'dist/docs/guide.bundle.json');

export function createGuideBundle(navigation, pageContents, sourceFingerprint) {
  if (
    navigation?.schemaVersion !== 1 ||
    typeof navigation.title !== 'string' ||
    !Array.isArray(navigation.sections) ||
    typeof sourceFingerprint !== 'string'
  ) {
    throw new Error('Documentation build received invalid navigation or source metadata');
  }
  const sections = navigation.sections.map((section) => {
    if (typeof section.title !== 'string' || !Array.isArray(section.items)) {
      throw new Error('Documentation section requires a title and page list');
    }
    const items = section.items.map((item) => {
      if (
        typeof item?.path !== 'string' ||
        !item.path.startsWith('docs/guide/') ||
        item.path.includes('\\')
      ) {
        throw new Error(`Documentation page must stay under docs/guide: ${String(item.path)}`);
      }
      const segments = item.path.split('/');
      if (segments.some((segment) => segment === '..' || segment === '.' || segment.length === 0)) {
        throw new Error(`Documentation page path is unsafe: ${item.path}`);
      }
      const markdown = pageContents[item.path];
      if (typeof markdown !== 'string') {
        throw new Error(`Documentation page content is missing: ${item.path}`);
      }
      return { title: item.title, kind: item.kind, path: item.path, markdown };
    });
    return { title: section.title, items };
  });
  return {
    schemaVersion: 1,
    title: navigation.title,
    sourceFingerprint,
    sections,
  };
}

export async function buildGuide() {
  const [navigationSource, metadataSource] = await Promise.all([
    readFile(navigationPath, 'utf8'),
    readFile(metadataPath, 'utf8'),
  ]);
  const navigation = JSON.parse(navigationSource);
  const metadata = JSON.parse(metadataSource);
  if (
    navigation?.schemaVersion !== 1 ||
    !Array.isArray(navigation.sections) ||
    navigation.sections.length === 0
  ) {
    throw new Error('Documentation build received invalid navigation');
  }
  const relativePaths = navigation.sections.flatMap((section) => {
    if (!Array.isArray(section?.items)) {
      throw new Error('Documentation section requires a page list');
    }
    return section.items.map((item) => {
      const relativePath = item?.path;
      if (
        typeof relativePath !== 'string' ||
        !relativePath.startsWith('docs/guide/') ||
        relativePath.includes('\\') ||
        relativePath.split('/').some((part) => !part || part === '.' || part === '..')
      ) {
        throw new Error(`Documentation page path is unsafe: ${String(relativePath)}`);
      }
      return relativePath;
    });
  });
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => [
      relativePath,
      await readFile(path.join(root, ...relativePath.split('/')), 'utf8'),
    ])
  );
  const pageContents = Object.fromEntries(entries);
  const bundle = createGuideBundle(navigation, pageContents, metadata.generatedFromSha256);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
  process.stdout.write(
    `Built ${relativePaths.length} documentation pages to dist/docs/guide.bundle.json.\n`
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  buildGuide().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Documentation build failed'}\n`
    );
    process.exitCode = 1;
  });
}
