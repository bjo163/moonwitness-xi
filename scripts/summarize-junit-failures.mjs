import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const maxAnnotations = 20;
const redactions = [
  /((?:password|secret|token|authorization|cookie)\s*[:=]\s*)[^\s<]+/giu,
  /(postgres(?:ql)?:\/\/)[^\s<]+/giu,
];

function decodeXmlAttribute(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/giu, (entity, code) => {
    if (code === 'amp') return '&';
    if (code === 'lt') return '<';
    if (code === 'gt') return '>';
    if (code === 'quot') return '"';
    if (code === 'apos') return "'";
    const numeric = code.startsWith('#x')
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : entity;
  });
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u'));
  return match ? decodeXmlAttribute(match[1]) : '';
}

function safeName(value) {
  return redactions.reduce((result, pattern) => result.replace(pattern, '$1[redacted]'), value);
}

export function summarizeJunitFailures(xml) {
  const failures = [];
  for (const [testCase] of xml.matchAll(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/gu)) {
    const openingEnd = testCase.indexOf('>');
    const opening = testCase.slice(0, openingEnd + 1);
    const body = testCase.endsWith('/>') ? '' : testCase.slice(openingEnd + 1);
    if (!/<(?:failure|error)\b/u.test(body)) continue;
    const suite = readAttribute(opening, 'classname');
    const name = readAttribute(opening, 'name') || 'Unnamed testcase';
    failures.push(safeName(suite ? `${suite} :: ${name}` : name));
  }
  return failures;
}

async function collectJunitFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return files;
    throw error;
  }
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectJunitFiles(file)));
    else if (entry.isFile() && entry.name.endsWith('.xml')) files.push(file);
  }
  return files;
}

function annotate(message) {
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  process.stdout.write(`::error title=Test failure::${escaped}\n`);
}

async function main() {
  const reportDirectory = process.argv[2];
  if (!reportDirectory) {
    process.stderr.write('Usage: node summarize-junit-failures.mjs <junit-directory>\n');
    process.exitCode = 2;
    return;
  }

  const files = await collectJunitFiles(reportDirectory);
  const failures = [];
  for (const file of files) {
    try {
      failures.push(...summarizeJunitFailures(await readFile(file, 'utf8')));
    } catch {
      annotate(`Could not read JUnit report ${path.basename(file)}.`);
      process.exitCode = 0;
      return;
    }
  }
  if (failures.length === 0) {
    annotate(
      files.length === 0
        ? 'Tests failed before a JUnit report was written.'
        : 'No named failing testcase was present in JUnit reports.'
    );
    return;
  }
  for (const failure of failures.slice(0, maxAnnotations)) annotate(failure);
  if (failures.length > maxAnnotations)
    annotate(`and ${failures.length - maxAnnotations} additional failing testcase(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
