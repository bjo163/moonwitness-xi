import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function renderPlatformAuditSummary(report) {
  const lines = [
    '## Monthly platform audit',
    '',
    `- Source: \`${report.source.sha}\``,
    `- Active artifacts: ${report.inventory.artifacts.count} (${report.inventory.artifacts.bytes} bytes); expiring within seven days: ${report.inventory.artifacts.expiringWithinSevenDays}.`,
    `- Workflow runs inspected (90 days): ${report.inventory.workflowRuns.count}.`,
    ...(report.inventory.workflowRuns.scheduledWorkflows ?? []).map(
      (workflow) =>
        `- Schedule ${workflow.name}: ${workflow.status}; last success ${workflow.lastSuccessAt ?? 'none'} (limit ${workflow.maximumAgeDays} days).`
    ),
    ...(report.runtimeSupport?.reviews ?? []).map(
      (review) =>
        `- Runtime review ${review.component} (${review.configured}): ${review.reviewStatus}; owner ${review.owner}; due ${review.reviewBy}.`
    ),
    `- Registry inventory: ${report.inventory.packages.status}; Actions billing: ${report.inventory.billing.status}.`,
    `- Cleanup: dry-run only; ${report.cleanupPlan.candidates.length} allowlisted candidates; no delete capability.`,
    '',
    ...report.limitations.map((item) => `- Limitation: ${item}`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const reportPath = process.argv[2];
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!reportPath || !summaryPath) {
    throw new Error('Pass an audit report path and set GITHUB_STEP_SUMMARY.');
  }
  const report = JSON.parse(await readFile(path.resolve(reportPath), 'utf8'));
  const summary = renderPlatformAuditSummary(report);
  await appendFile(summaryPath, summary, 'utf8');
  process.stdout.write(summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
