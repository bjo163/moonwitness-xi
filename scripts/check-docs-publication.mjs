import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [siteDirectory] = process.argv.slice(2);
if (!siteDirectory || !fs.existsSync(siteDirectory)) {
  process.stderr.write('Usage: node scripts/check-docs-publication.mjs <built-site-directory>\n');
  process.exit(2);
}

const forbiddenNames = new Set([
  '.env',
  '.env.local',
  '.env.production',
  'auth.json',
  'playwright/.auth',
  'test-results',
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/,
  /postgres(?:ql)?:\/\/[^\s"']+:[^\s"'@]+@/i,
  /(?:password|secret|token)\s*[:=]\s*["'][^"']{12,}["']/i,
];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    const relativePath = path.relative(siteDirectory, filePath).replaceAll(path.sep, '/');
    if (
      forbiddenNames.has(entry.name) ||
      /(?:^|\/)(?:\.env(?:\..*)?|\.git|test-results|playwright\/\.auth)(?:\/|$)/i.test(relativePath)
    ) {
      throw new Error(`Forbidden publication path: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      scan(filePath);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Unexpected filesystem entry: ${relativePath}`);
    if (entry.name.endsWith('.map'))
      throw new Error(`Source maps are not allowed in public docs: ${relativePath}`);
    const contents = fs.readFileSync(filePath);
    if (contents.includes(0)) continue;
    const text = contents.toString('utf8');
    for (const pattern of secretPatterns) {
      if (pattern.test(text))
        throw new Error(`Potential secret detected in public file: ${relativePath}`);
    }
  }
}

try {
  scan(siteDirectory);
  process.stdout.write(`Public documentation scan passed: ${siteDirectory}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
