import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL as FileURL } from 'node:url';
import process from 'node:process';

const catalogDirectory = fileURLToPath(new FileURL('../../ui-catalog/dist/', import.meta.url));
const publishedDirectory = fileURLToPath(new FileURL('../dist/components/', import.meta.url));

await access(path.join(catalogDirectory, 'index.html'));
await mkdir(publishedDirectory, { recursive: true });
await cp(catalogDirectory, publishedDirectory, { recursive: true, force: true });
process.stdout.write('Copied the built UI catalog into the documentation Pages artifact.\n');
