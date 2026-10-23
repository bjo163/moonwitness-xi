import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(root, 'dist', `whatsapp${process.platform === 'win32' ? '.exe' : ''}`);
if (!existsSync(binary)) {
  process.stderr.write('Built WhatsApp service not found. Run the workspace build first.\n');
  process.exit(1);
}
const child = spawn(binary, [], { cwd: root, env: process.env, stdio: 'inherit' });
child.on('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
