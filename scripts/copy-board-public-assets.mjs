import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'packages/assets');
const target = path.join(root, 'apps/board/public');
for (const directory of ['brand', 'illustrations', 'sounds']) {
  await mkdir(path.join(target, directory), { recursive: true });
  await cp(path.join(source, directory), path.join(target, directory), {
    recursive: true,
    force: true,
  });
}
