import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stderr, stdout, exit } from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const markdownFiles = [];
const missingLinks = [];
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;

const visit = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      await visit(join(directory, entry.name));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      markdownFiles.push(join(directory, entry.name));
    }
  }
};

await visit(root);

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1].trim().replace(/^<|>$/gu, '').split(/\s+/u)[0];
    if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(target)) continue;
    const localPath = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!localPath) continue;
    const resolvedTarget = resolve(dirname(file), localPath);
    try {
      await stat(resolvedTarget);
    } catch {
      const line = source.slice(0, match.index).split('\n').length;
      missingLinks.push(`${file.slice(root.length + 1)}:${line}: ${target}`);
    }
  }
}

if (missingLinks.length > 0) {
  stderr.write(
    `Found ${missingLinks.length} broken local Markdown link(s):\n${missingLinks.join('\n')}\n`
  );
  exit(1);
}

stdout.write(`Checked ${markdownFiles.length} Markdown files; all local links resolve.\n`);
