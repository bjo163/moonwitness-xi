import { copyFile } from 'node:fs/promises';
import { fileURLToPath, URL as FileURL } from 'node:url';

await copyFile(
  fileURLToPath(new FileURL('../dist/index.html', import.meta.url)),
  fileURLToPath(new FileURL('../dist/404.html', import.meta.url))
);
