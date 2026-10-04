import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { enqueueJob, jobsManifest, registerJobHandler, runOneJob } from '@moonwitness/jobs';
import { installAddons } from '@moonwitness/orm';
import { Company, Partner, manifest as baseManifest } from '@moonwitness/orm-base';
import { manifest as authManifest } from '@moonwitness/auth';
import { createPostgresKnexConfig } from '../src/config/knexfile.js';

const connectionString = process.env.POSTGRES_TEST_URL;
if (process.env.REQUIRE_POSTGRES_TESTS === 'true' && !connectionString) {
  throw new Error('POSTGRES_TEST_URL is required when REQUIRE_POSTGRES_TESTS=true');
}
const postgresDescribe = connectionString ? describe : describe.skip;
const fixtureSize = 120;
const sampleCount = 5;
const warmupCount = 1;
const eagerQueryBudget = 2;
const listQueryBudget = 1;
const countQueryBudget = 1;
const jobClaimQueryBudget = 12;

interface QuerySample<T> {
  value: T;
  queryCount: number;
  durationMs: number;
  heapDeltaBytes: number;
}

interface RestoreBenchmarkPayload {
  fixtureId: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function summarize(values: readonly number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    samples: values.length,
    min: round(Math.min(...values)),
    median: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    mean: round(mean),
    standardDeviation: round(Math.sqrt(variance)),
  };
}

async function captureQuerySample<T>(db: Knex, work: () => Promise<T>): Promise<QuerySample<T>> {
  let queryCount = 0;
  const listener = () => {
    queryCount += 1;
  };
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  db.on('query', listener);
  try {
    const value = await work();
    return {
      value,
      queryCount,
      durationMs: performance.now() - started,
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    };
  } finally {
    db.removeListener('query', listener);
  }
}

async function sampleOperation<T>(
  db: Knex,
  operation: () => Promise<T>
): Promise<{
  samples: QuerySample<T>[];
  timingsMs: ReturnType<typeof summarize>;
  heapDeltaBytes: number;
}> {
  const runs: QuerySample<T>[] = [];
  for (let index = 0; index < warmupCount + sampleCount; index += 1) {
    runs.push(await captureQuerySample(db, operation));
  }
  const samples = runs.slice(warmupCount);
  const queryCounts = new Set(samples.map(({ queryCount }) => queryCount));
  expect(queryCounts.size).toBe(1);
  return {
    samples,
    timingsMs: summarize(samples.map(({ durationMs }) => durationMs)),
    heapDeltaBytes: round(
      percentile(
        samples.map(({ heapDeltaBytes }) => heapDeltaBytes),
        50
      )
    ),
  };
}

function explainPlan(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || !('rows' in result)) return null;
  const rows = result.rows;
  if (!Array.isArray(rows)) return null;
  const first = rows[0];
  if (typeof first !== 'object' || first === null || !('QUERY PLAN' in first)) return null;
  return first['QUERY PLAN'];
}

postgresDescribe('PostgreSQL query and job performance baseline', () => {
  let adminDb: Knex;
  let db: Knex;
  const schema = `mw_perf_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    if (!connectionString) throw new Error('POSTGRES_TEST_URL is required');
    adminDb = knex({ client: 'pg', connection: connectionString, pool: { min: 0, max: 2 } });
    await adminDb.raw('create schema ??', [schema]);
    db = knex(
      createPostgresKnexConfig(
        connectionString,
        { poolMin: 0, poolMax: 4, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000 },
        { searchPath: [schema] }
      )
    );
    await installAddons(db, [baseManifest, authManifest, jobsManifest]);
  }, 60_000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (adminDb) {
      await adminDb.raw('drop schema if exists ?? cascade', [schema]);
      await adminDb.destroy();
    }
  });

  it('records stable list/count/eager/job query budgets and noisy latency/heap observations', async () => {
    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const now = new Date().toISOString();
    const partnerRows = await db('partners')
      .insert(
        Array.from({ length: fixtureSize }, (_, index) => ({
          name: `Performance Fixture ${String(index).padStart(3, '0')}`,
          email: `m4-15-fixture-${index}@example.test`,
          is_company: true,
          is_customer: true,
          is_supplier: false,
          active: true,
          company_id: company.id,
          create_date: now,
          write_date: now,
        }))
      )
      .returning('id');
    const partnerIds = (partnerRows as Array<{ id: number }>).map(({ id }) => Number(id));
    const addressRows = partnerIds.flatMap((partnerId, index) =>
      [0, 1].map((addressIndex) => ({
        partner_id: partnerId,
        label: `Performance ${index} Address ${addressIndex}`,
        address_type: 'other',
        street: `${index + 1} Query Budget Street`,
        city: 'Benchmark City',
        is_primary: addressIndex === 0,
        active: true,
        create_date: now,
        write_date: now,
      }))
    );
    await db('partner_addresses').insert(addressRows);

    const list = await sampleOperation(db, () =>
      Partner.search_read([['id', 'in', partnerIds]], {
        fields: ['name'],
        activeTest: false,
        order: 'id asc',
      })
    );
    const listRows = list.samples[0]?.value ?? [];
    expect(listRows).toHaveLength(fixtureSize);
    expect(list.samples.every(({ queryCount }) => queryCount === listQueryBudget)).toBe(true);

    const count = await sampleOperation(db, () =>
      Partner.search_count([['id', 'in', partnerIds]], { activeTest: false })
    );
    expect(count.samples[0]?.value).toBe(fixtureSize);
    expect(count.samples.every(({ queryCount }) => queryCount === countQueryBudget)).toBe(true);

    const eagerSmallIds = partnerIds.slice(0, 12);
    const eagerSmall = await sampleOperation(db, () =>
      Partner.search_read([['id', 'in', eagerSmallIds]], {
        fields: ['name'],
        withGraphFetched: 'addresses',
        activeTest: false,
        order: 'id asc',
      })
    );
    const eagerLarge = await sampleOperation(db, () =>
      Partner.search_read([['id', 'in', partnerIds]], {
        fields: ['name'],
        withGraphFetched: 'addresses',
        activeTest: false,
        order: 'id asc',
      })
    );
    const relatedAddressCount = (records: readonly Record<string, unknown>[]) =>
      records.reduce((total, record) => {
        const addresses = record.addresses;
        return total + (Array.isArray(addresses) ? addresses.length : 0);
      }, 0);
    expect(eagerSmall.samples[0]?.queryCount).toBe(eagerQueryBudget);
    expect(eagerLarge.samples[0]?.queryCount).toBe(eagerQueryBudget);
    expect(eagerSmall.samples[0]?.value).toHaveLength(12);
    expect(eagerLarge.samples[0]?.value).toHaveLength(fixtureSize);
    expect(relatedAddressCount(eagerSmall.samples[0]?.value ?? [])).toBe(24);
    expect(relatedAddressCount(eagerLarge.samples[0]?.value ?? [])).toBe(fixtureSize * 2);

    const unregister = registerJobHandler<RestoreBenchmarkPayload>({
      name: 'benchmark.postgres-claim',
      version: 1,
      parse(payload: unknown): RestoreBenchmarkPayload {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('fixtureId' in payload) ||
          typeof payload.fixtureId !== 'number'
        ) {
          throw new Error('Invalid performance fixture job payload');
        }
        return { fixtureId: payload.fixtureId };
      },
      async run(payload) {
        return { processed: payload.fixtureId };
      },
    });
    const jobCount = 8;
    try {
      await Promise.all(
        Array.from({ length: jobCount }, (_, fixtureId) =>
          enqueueJob('benchmark.postgres-claim', { fixtureId })
        )
      );
      const jobSamples: QuerySample<void>[] = [];
      for (let index = 0; index < warmupCount + sampleCount; index += 1) {
        await Promise.all(
          Array.from({ length: jobCount }, (_, fixtureId) =>
            enqueueJob('benchmark.postgres-claim', { fixtureId })
          )
        );
        const measurement = await captureQuerySample(db, async () => {
          for (let jobIndex = 0; jobIndex < jobCount; jobIndex += 1) {
            expect(
              await runOneJob({ workerId: `m4-15-benchmark-${index}`, leaseSeconds: 60 })
            ).toBe(true);
          }
        });
        jobSamples.push(measurement);
      }
      const measuredJobSamples = jobSamples.slice(warmupCount);
      const jobQueriesPerClaim = measuredJobSamples.map(({ queryCount }) => queryCount / jobCount);
      expect(jobQueriesPerClaim.every((count) => count <= jobClaimQueryBudget)).toBe(true);
      expect(new Set(jobQueriesPerClaim).size).toBe(1);
      const jobClaim = {
        jobsPerSample: jobCount,
        queryBudgetPerClaim: jobClaimQueryBudget,
        observedQueriesPerClaim: jobQueriesPerClaim[0],
        timingsMs: summarize(measuredJobSamples.map(({ durationMs }) => durationMs / jobCount)),
        heapDeltaBytesPerSample: round(
          percentile(
            measuredJobSamples.map(({ heapDeltaBytes }) => heapDeltaBytes),
            50
          ) / jobCount
        ),
      };

      const partnerPlan = explainPlan(
        await db.raw(
          'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM partners WHERE company_id = ? AND active = true ORDER BY id LIMIT 120',
          [company.id]
        )
      );
      const addressPlanQuery = Partner.bindKnex(db)
        .relatedQuery('addresses')
        .for(partnerIds)
        .toKnexQuery()
        .toSQL()
        .toNative();
      const addressPlanSql = addressPlanQuery.sql.replace(/\$(\d+)/gu, (_, index: string) =>
        String(addressPlanQuery.bindings[Number(index) - 1])
      );
      const addressPlan = explainPlan(
        await db.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${addressPlanSql}`)
      );
      expect(partnerPlan).not.toBeNull();
      expect(addressPlan).not.toBeNull();
      const serverVersionResult = await db.raw('SHOW server_version');
      const serverVersionRows = (serverVersionResult as { rows?: Array<Record<string, unknown>> })
        .rows;
      const serverVersion = String(serverVersionRows?.[0]?.server_version ?? 'unavailable');
      const report = {
        task: 'M4.15',
        environment: {
          node: process.version,
          postgres: serverVersion,
          runner: process.env.RUNNER_OS ?? 'local',
          iterations: sampleCount,
          fixture: {
            partners: fixtureSize,
            addresses: addressRows.length,
            jobsPerSample: jobCount,
          },
        },
        queryBudgets: {
          list: listQueryBudget,
          count: countQueryBudget,
          eagerLoading: eagerQueryBudget,
          eagerLoadingDoesNotGrowWithResultCount: true,
          jobClaimPerItem: jobClaimQueryBudget,
        },
        observations: {
          list: {
            queryCount: list.samples[0]?.queryCount,
            timingsMs: list.timingsMs,
            heapDeltaBytes: list.heapDeltaBytes,
          },
          count: {
            queryCount: count.samples[0]?.queryCount,
            timingsMs: count.timingsMs,
            heapDeltaBytes: count.heapDeltaBytes,
          },
          eagerLoading: {
            smallResultCount: 12,
            smallQueryCount: eagerSmall.samples[0]?.queryCount,
            smallTimingsMs: eagerSmall.timingsMs,
            smallHeapDeltaBytes: eagerSmall.heapDeltaBytes,
            largeResultCount: fixtureSize,
            largeQueryCount: eagerLarge.samples[0]?.queryCount,
            largeTimingsMs: eagerLarge.timingsMs,
            largeHeapDeltaBytes: eagerLarge.heapDeltaBytes,
            relatedRows: fixtureSize * 2,
          },
          jobClaim,
        },
        explain: {
          partnerList: partnerPlan,
          eagerAddressLookup: addressPlan,
        },
        interpretation:
          'Query-count budgets are structural gates. Latency and heap values are observations from a shared CI runner, not absolute service-level objectives.',
      };
      const reportDirectory = resolve(process.cwd(), '../..', 'test-results/performance');
      await mkdir(reportDirectory, { recursive: true });
      await writeFile(
        resolve(reportDirectory, 'm4.15.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        }
      );
      const evidencePath = process.env.M4_15_EVIDENCE_PATH;
      if (evidencePath) {
        const resolvedEvidencePath = isAbsolute(evidencePath)
          ? evidencePath
          : resolve(process.cwd(), '../..', evidencePath);
        await mkdir(dirname(resolvedEvidencePath), { recursive: true });
        await writeFile(resolvedEvidencePath, `${JSON.stringify(report, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
      }
      process.stdout.write(`M4.15 performance baseline: ${JSON.stringify(report)}\n`);
    } finally {
      unregister();
    }
  }, 60_000);
});
