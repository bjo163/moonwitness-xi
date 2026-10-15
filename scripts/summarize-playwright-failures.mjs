import { readFile } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const maxAnnotations = 10;

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

function readXmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u'));
  return match ? decodeXmlAttribute(match[1]) : '';
}

function escapeWorkflowCommandData(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export function summarizeFailedTests(xml) {
  const failures = [];
  const testCases = xml.matchAll(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/gu);

  for (const [testCase] of testCases) {
    const openingTagEnd = testCase.indexOf('>');
    const openingTag = testCase.slice(0, openingTagEnd + 1);
    const body = testCase.endsWith('/>') ? '' : testCase.slice(openingTagEnd + 1);
    if (!/<(?:failure|error)\b/u.test(body)) continue;

    const className = readXmlAttribute(openingTag, 'classname');
    const testName = readXmlAttribute(openingTag, 'name') || 'Unnamed Playwright test';
    failures.push(className ? `${className} :: ${testName}` : testName);
  }

  return failures;
}

function writeAnnotation(message) {
  process.stdout.write(`::error title=Board E2E failed::${escapeWorkflowCommandData(message)}\n`);
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    process.stderr.write('Usage: node summarize-playwright-failures.mjs <junit-report.xml>\n');
    process.exitCode = 2;
    return;
  }

  let xml;
  try {
    xml = await readFile(reportPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      writeAnnotation(
        'Playwright did not produce a JUnit report; inspect the test-step diagnostics.'
      );
      return;
    }
    process.stderr.write('Could not read the Playwright JUnit report.\n');
    process.exitCode = 1;
    return;
  }

  const failures = summarizeFailedTests(xml);
  if (failures.length === 0) {
    writeAnnotation('JUnit contains no named failed testcase; inspect the test-step diagnostics.');
    return;
  }

  for (const failure of failures.slice(0, maxAnnotations)) writeAnnotation(failure);
  if (failures.length > maxAnnotations) {
    writeAnnotation(`and ${failures.length - maxAnnotations} additional failed testcase(s)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
