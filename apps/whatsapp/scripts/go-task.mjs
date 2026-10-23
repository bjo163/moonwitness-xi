import { existsSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suffix = process.platform === 'win32' ? '.exe' : '';
const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
const pathGo = pathEntries.map((entry) => path.join(entry, `go${suffix}`)).find(existsSync);
const candidates = [
  process.env.GO_BIN === 'go' ? pathGo : process.env.GO_BIN,
  pathGo,
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Go', 'bin', 'go.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Go1.26.10', 'go', 'bin', 'go.exe'),
  'C:\\Program Files\\Go\\bin\\go.exe',
  '/usr/local/go/bin/go',
].filter(Boolean);

function resolvable(candidate) {
  return existsSync(candidate);
}

const go = candidates.find(resolvable);
if (!go) {
  process.stderr.write('Go is required for apps/whatsapp. Install the version required by apps/whatsapp/go.mod (Go 1.26 or newer).\n');
  process.exit(127);
}

const action = process.argv[2];
let args = process.argv.slice(3);
if (action === 'build') {
  const dist = path.join(root, 'dist');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dist, { recursive: true });
  args = ['build', '-trimpath', '-o', path.join(dist, `whatsapp${suffix}`), './cmd/whatsapp'];
} else if (!['run', 'test', 'vet', 'fmt-check'].includes(action)) {
  process.stderr.write('Usage: go-task.mjs <build|run|test|vet|fmt-check> [go args...]\n');
  process.exit(2);
}

if (action === 'test') args = ['test', './...'];
if (action === 'vet') args = ['vet', './...'];
if (action === 'fmt-check') {
  const files = [];
  const collectGoFiles = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collectGoFiles(file);
      else if (entry.isFile() && entry.name.endsWith('.go')) files.push(file);
    }
  };
  collectGoFiles(path.join(root, 'cmd'));
  collectGoFiles(path.join(root, 'internal'));
  const formatterDirectory = path.dirname(go);
  const formatter = formatterDirectory
    ? path.join(formatterDirectory, `gofmt${suffix}`)
    : `gofmt${suffix}`;
  const result = spawnSync(formatter, ['-d', ...files], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${path.dirname(go)}${path.delimiter}${process.env.PATH ?? ''}` },
    shell: false,
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exitCode = 127;
  } else if (result.status !== 0 || result.stdout) {
    process.stderr.write(result.stdout || result.stderr || 'Go formatting check failed.\n');
    process.exitCode = 1;
  }
  process.exit();
}
const child = spawn(go, args, { cwd: root, env: { ...process.env, PATH: `${path.dirname(go)}${path.delimiter}${process.env.PATH ?? ''}` }, stdio: 'inherit' });
child.on('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 127; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
