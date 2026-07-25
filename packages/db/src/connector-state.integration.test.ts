import { expect, test } from 'bun:test';

import type {
  CrawlRun,
  DiscoveryCandidateSink,
  PublicationCandidate,
  TransactionContext,
} from '@web-comic-library/application';
import { commitDiscovery } from '@web-comic-library/application';
import { createSource } from '@web-comic-library/domain';
import postgres from 'postgres';

import { createPostgresCatalog } from './catalog';
import { createPostgresConnectorState } from './connector-state';
import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'connector state commits checkpoints atomically and requires explicit resume after failures',
  async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const catalog = createPostgresCatalog(databaseUrl);
    const foundation = createPostgresFoundation(databaseUrl);
    const states = createPostgresConnectorState(databaseUrl, foundation);
    const source = createSource({
      baseUrl: 'https://connector-state.example/',
      id: crypto.randomUUID(),
      key: `connector-state-${crypto.randomUUID()}`,
      name: 'Connector state test source',
    });
    let rejectCandidates = false;
    const candidates: DiscoveryCandidateSink = {
      saveCandidates: async (
        context: TransactionContext,
        sourceId: string,
        values: readonly PublicationCandidate[],
      ) => {
        return foundation.withSession(context, async (session) => {
          const inserted = await Promise.all(
            values.map((candidate) => {
              return session<{ url: string }[]>`
                insert into connector_test_candidates (source_id, url, title)
                values (${sourceId}, ${candidate.url}, ${candidate.title})
                on conflict (source_id, url) do nothing
                returning url
              `;
            }),
          );

          if (rejectCandidates) {
            throw new Error('candidate persistence failed');
          }

          return inserted.reduce((count, rows) => count + rows.length, 0);
        });
      },
    };
    const candidate = (suffix: string): PublicationCandidate => ({
      ageRatingValue: 'all-ages',
      authors: ['Fixture Author'],
      entries: [],
      externalId: suffix,
      sourceId: source.id,
      title: `Candidate ${suffix}`,
      url: `https://connector-state.example/publications/${suffix}`,
    });
    const startedAt = new Date('2026-07-25T00:00:00Z');
    let runOffset = 0;
    const run = (failureCode: CrawlRun['failureCode'] = null): CrawlRun => {
      runOffset += 1;
      return {
        durationMs: 250,
        failureCode,
        finishedAt: new Date(startedAt.getTime() + runOffset * 1_000),
        id: crypto.randomUUID(),
        parseFailureCount: failureCode === 'parse' ? 1 : 0,
        sourceId: source.id,
        startedAt,
        successCount: failureCode === null ? 1 : 0,
      };
    };
    const fetchState = {
      bodyHash: 'a'.repeat(64),
      checkedAt: new Date('2026-07-25T00:00:01Z'),
      etag: '"fixture-v1"',
      lastModified: 'Fri, 25 Jul 2026 00:00:00 GMT',
      sourceId: source.id,
      url: 'https://connector-state.example/feed',
    };

    try {
      await catalog.createSource(source);
      await sql`
        create table if not exists connector_test_candidates (
          source_id uuid not null,
          url text not null,
          title text not null,
          primary key (source_id, url)
        )
      `;

      const first = await commitDiscovery(foundation, states, candidates, {
        batch: { candidates: [candidate('one')], checkpoint: { cursor: 'one' } },
        fetchStates: [fetchState],
        run: run(),
      });
      const duplicate = await commitDiscovery(foundation, states, candidates, {
        batch: { candidates: [candidate('one')], checkpoint: { cursor: 'one' } },
        fetchStates: [fetchState],
        run: run(),
      });
      expect(first.insertedCandidates).toBe(1);
      expect(duplicate.insertedCandidates).toBe(0);
      expect(await states.findSourceCrawlState(source.id)).toMatchObject({
        checkpoint: { cursor: 'one' },
        consecutiveFailures: 0,
        status: 'active',
      });
      expect(await states.findFetchResource(source.id, fetchState.url)).toMatchObject(fetchState);

      rejectCandidates = true;
      await expect(
        commitDiscovery(foundation, states, candidates, {
          batch: { candidates: [candidate('rollback')], checkpoint: { cursor: 'rollback' } },
          fetchStates: [{ ...fetchState, bodyHash: 'b'.repeat(64) }],
          run: run(),
        }),
      ).rejects.toThrow('candidate persistence failed');
      rejectCandidates = false;
      expect(await states.findSourceCrawlState(source.id)).toMatchObject({
        checkpoint: { cursor: 'one' },
      });

      expect((await states.recordFailure(run('timeout'), 3)).status).toBe('active');
      expect((await states.recordFailure(run('network'), 3)).status).toBe('active');
      const stopped = await states.recordFailure(run('parse'), 3);
      expect(stopped).toMatchObject({
        checkpoint: { cursor: 'one' },
        consecutiveFailures: 3,
        status: 'stopped',
      });

      await expect(
        commitDiscovery(foundation, states, candidates, {
          batch: { candidates: [candidate('stopped')], checkpoint: { cursor: 'stopped' } },
          fetchStates: [fetchState],
          run: run(),
        }),
      ).rejects.toThrow('is stopped');

      expect(await states.resume(source.id, new Date('2026-07-25T00:10:00Z'))).toMatchObject({
        checkpoint: { cursor: 'one' },
        consecutiveFailures: 0,
        status: 'active',
      });
      await commitDiscovery(foundation, states, candidates, {
        batch: { candidates: [candidate('two')], checkpoint: { cursor: 'two' } },
        fetchStates: [fetchState],
        run: run(),
      });

      const persisted = await sql<{ count: number }[]>`
        select count(*)::int as count
        from connector_test_candidates
        where source_id = ${source.id}
      `;
      const crawlRuns = await sql<{ count: number; parseFailures: number }[]>`
        select
          count(*)::int as count,
          sum(parse_failure_count)::int as "parseFailures"
        from crawl_runs
        where source_id = ${source.id}
      `;
      expect(persisted[0]?.count).toBe(2);
      expect(crawlRuns[0]).toEqual({ count: 6, parseFailures: 1 });
      expect(await states.findSourceCrawlState(source.id)).toMatchObject({
        checkpoint: { cursor: 'two' },
        consecutiveFailures: 0,
        status: 'active',
      });
    } finally {
      await sql`delete from connector_test_candidates where source_id = ${source.id}`;
      await sql`delete from crawl_runs where source_id = ${source.id}`;
      await sql`delete from fetch_resource_states where source_id = ${source.id}`;
      await sql`delete from source_crawl_states where source_id = ${source.id}`;
      await sql`delete from sources where id = ${source.id}`;
      await states.close();
      await foundation.close();
      await catalog.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
