import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default class PlaywrightFlakeReporter {
  #firstAttemptByTest = new Map();
  #retriesByTest = new Map();

  constructor(options = {}) {
    this.outputFile = path.resolve(
      options.outputFile ?? 'test-results/junit/board-e2e-retries.json'
    );
  }

  onTestEnd(test, result) {
    if (result.retry === 0) {
      this.#firstAttemptByTest.set(test.id, result.status);
      return;
    }

    const firstAttemptStatus = this.#firstAttemptByTest.get(test.id);
    if (firstAttemptStatus && firstAttemptStatus !== 'passed') {
      const firstAttempt = test.results[0];
      this.#retriesByTest.set(test.id, {
        title: test.titlePath().filter(Boolean).join(' › '),
        file: test.location.file,
        firstAttemptStatus,
        firstAttemptError: firstAttempt?.error
          ? {
              name: firstAttempt.error.name ?? 'Error',
              message: firstAttempt.error.message ?? '',
            }
          : null,
        retryStatus: result.status,
        retryNumber: result.retry,
      });
    }
  }

  async onEnd(result) {
    await mkdir(path.dirname(this.outputFile), { recursive: true });
    await writeFile(
      this.outputFile,
      `${JSON.stringify(
        {
          version: 1,
          runStatus: result.status,
          retries: [...this.#retriesByTest.values()].sort((left, right) =>
            left.title.localeCompare(right.title)
          ),
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  }
}
