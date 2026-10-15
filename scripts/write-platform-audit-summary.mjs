import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function renderPlatformAuditSummary(report) {
  const artifactInventory = report.inventory.artifacts;
  const artifactBytesSummary =
    artifactInventory.bytesStatus === 'partial'
      ? `size unknown for ${artifactInventory.unknownSizeCount} artifact(s)`
      : artifactInventory.bytesStatus === 'unknown'
        ? 'size unknown'
        : `${artifactInventory.bytes} bytes`;
  const lines = [
    '## Monthly platform audit',
    '',
    `- Source: \`${report.source.sha}\``,
    `- Audit status: ${report.status ?? 'complete'}.`,
    report.workflowArtifactRetention
      ? `- Workflow artifact retention: ${report.workflowArtifactRetention.status}; ${report.workflowArtifactRetention.uploadStepCount} upload step(s), maximum ${report.workflowArtifactRetention.maximumRetentionDays} days.`
      : '- Workflow artifact retention: unknown.',
    ...(report.workflowArtifactRetention?.violations ?? []).map(
      (violation) => `- Artifact retention violation: ${violation}`
    ),
    artifactInventory.status === 'unknown'
      ? `- Active artifacts: unknown (${artifactInventory.reason}).`
      : `- Active artifacts: ${artifactInventory.count} (${artifactBytesSummary}); expiring within seven days: ${artifactInventory.expiringWithinSevenDays}.`,
    report.inventory.workflowRuns.status === 'unknown'
      ? `- Workflow runs inspected (90 days): unknown (${report.inventory.workflowRuns.reason}).`
      : `- Workflow runs inspected (90 days): ${report.inventory.workflowRuns.count}.`,
    ...(report.inventory.workflowRuns.scheduledWorkflows ?? []).map(
      (workflow) =>
        `- Schedule ${workflow.name}: ${workflow.status}; last success ${workflow.lastSuccessAt ?? 'none'} (limit ${workflow.maximumAgeDays} days).`
    ),
    ...(report.runtimeSupport?.reviews ?? []).map(
      (review) =>
        `- Runtime review ${review.component} (${review.configured}): ${review.reviewStatus}; owner ${review.owner}; due ${review.reviewBy}.`
    ),
    `- Registry inventory: ${report.inventory.packages.status}; Actions billing: ${report.inventory.billing.status}.`,
    report.cleanupPlan.status === 'unknown'
      ? `- Cleanup: dry-run only; candidates unknown (${report.cleanupPlan.reason}); no delete capability.`
      : `- Cleanup: dry-run only; ${report.cleanupPlan.candidates.length} allowlisted candidates; no delete capability.`,
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
