import { expect, test } from 'bun:test';

import {
  ingestDiscovery,
  type CompleteDiscoveryInput,
  type PublicationCandidate,
} from '@web-comic-library/application';
import { createSource } from '@web-comic-library/domain';
import postgres from 'postgres';

import { createPostgresCatalog } from './catalog';
import { createPostgresConnectorState } from './connector-state';
import { createPostgresFoundation } from './foundation';
import { createPostgresIngestion } from './ingestion';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

const candidate = (sourceId: string, suffix: string, title = '第1話'): PublicationCandidate => ({
  ageRatingValue: 'all',
  authors: ['統合 作者'],
  entries: [
    {
      externalId: 'entry-' + suffix,
      kind: 'regular',
      publishedAt: new Date('2026-07-27T00:00:00Z'),
      title,
      url: 'https://ingestion-test.example/entries/' + suffix,
    },
  ],
  externalId: 'publication-' + suffix,
  kind: 'official',
  kindEvidence: 'https://ingestion-test.example/evidence',
  sourceId,
  title: '統合 作品',
  updatedAt: new Date('2026-07-27T00:00:00Z'),
  url: 'https://ingestion-test.example/publications/' + suffix,
});

integrationTest(
  'ingestion persists candidates, exact cross-source mappings, events, and checkpoint atomically',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const catalog = createPostgresCatalog(databaseUrl);
    const foundation = createPostgresFoundation(databaseUrl);
    const states = createPostgresConnectorState(databaseUrl, foundation);
    const ingestion = createPostgresIngestion(databaseUrl, foundation);
    const sql = postgres(databaseUrl, { max: 1 });
    const sourceOne = createSource({
      baseUrl: 'https://ingestion-test.example/',
      id: crypto.randomUUID(),
      key: 'ingestion-one-' + crypto.randomUUID(),
      name: '統合元1',
    });
    const sourceTwo = createSource({
      baseUrl: 'https://ingestion-test.example/',
      id: crypto.randomUUID(),
      key: 'ingestion-two-' + crypto.randomUUID(),
      name: '統合元2',
    });
    let runIndex = 0;
    const input = (
      sourceId: string,
      values: readonly PublicationCandidate[],
      mode: 'backfill' | 'incremental' | 'initial',
      cursor: string,
    ): CompleteDiscoveryInput & { mode: 'backfill' | 'incremental' | 'initial' } => {
      runIndex += 1;
      return {
        batch: { candidates: values, checkpoint: { cursor } },
        fetchStates: [],
        mode,
        run: {
          durationMs: 1,
          failureCode: null,
          finishedAt: new Date('2026-07-27T00:00:' + String(runIndex).padStart(2, '0') + 'Z'),
          id: crypto.randomUUID(),
          parseFailureCount: 0,
          sourceId,
          startedAt: new Date('2026-07-27T00:00:00Z'),
          successCount: values.length,
        },
      };
    };

    try {
      await catalog.createSource(sourceOne);
      await catalog.createSource(sourceTwo);

      const first = await ingestDiscovery(
        foundation,
        states,
        ingestion,
        input(sourceOne.id, [candidate(sourceOne.id, 'one')], 'initial', 'one'),
      );
      const repeated = await ingestDiscovery(
        foundation,
        states,
        ingestion,
        input(sourceOne.id, [candidate(sourceOne.id, 'one')], 'initial', 'one'),
      );
      const crossSource = await ingestDiscovery(
        foundation,
        states,
        ingestion,
        input(sourceTwo.id, [candidate(sourceTwo.id, 'two')], 'incremental', 'two'),
      );

      expect(first).toEqual({ insertedCandidates: 1, releaseEventCount: 1 });
      expect(repeated).toEqual({ insertedCandidates: 0, releaseEventCount: 0 });
      expect(crossSource).toEqual({ insertedCandidates: 1, releaseEventCount: 1 });

      const events = await sql.unsafe<{ notificationSuppressed: boolean; sourceId: string }[]>(
        'select source_id::text as "sourceId", notification_suppressed as "notificationSuppressed" from release_events where source_id = any($1::uuid[]) order by source_id',
        [[sourceOne.id, sourceTwo.id]],
      );
      const mappings = await sql.unsafe<{ count: number }[]>(
        'select count(*)::int as count from entry_content_mappings where work_id = (select work_id from publications where source_id = $1 limit 1)',
        [sourceOne.id],
      );

      expect(events).toHaveLength(2);
      expect(events.find((event) => event.sourceId === sourceOne.id)?.notificationSuppressed).toBe(
        true,
      );
      expect(events.find((event) => event.sourceId === sourceTwo.id)?.notificationSuppressed).toBe(
        false,
      );
      expect(mappings[0]?.count).toBe(2);

      const invalid = {
        ...candidate(sourceOne.id, 'broken'),
        externalId: 'publication-broken',
        url: 'not-a-url',
      };
      await expect(
        ingestDiscovery(
          foundation,
          states,
          ingestion,
          input(sourceOne.id, [invalid], 'incremental', 'broken'),
        ),
      ).rejects.toThrow();
      expect((await states.findSourceCrawlState(sourceOne.id)).checkpoint).toEqual({
        cursor: 'one',
      });
    } finally {
      const workRows = await sql.unsafe<{ id: string }[]>(
        'select distinct work_id::text as id from publications where source_id = any($1::uuid[])',
        [[sourceOne.id, sourceTwo.id]],
      );
      const workIds = workRows.map((work) => work.id);
      const creatorRows = await sql.unsafe<{ id: string }[]>(
        'select creator_id::text as id from work_creators where work_id = any($1::uuid[])',
        [workIds],
      );
      const creatorIds = creatorRows.map((creator) => creator.id);
      await sql.unsafe('delete from release_events where source_id = any($1::uuid[])', [
        [sourceOne.id, sourceTwo.id],
      ]);
      await sql.unsafe(
        'delete from entry_content_mappings where work_id in (select distinct work_id from publications where source_id = any($1::uuid[]))',
        [[sourceOne.id, sourceTwo.id]],
      );
      await sql.unsafe(
        'delete from publication_entries where publication_id in (select id from publications where source_id = any($1::uuid[]))',
        [[sourceOne.id, sourceTwo.id]],
      );
      await sql.unsafe(
        'delete from content_units where work_id in (select distinct work_id from publications where source_id = any($1::uuid[]))',
        [[sourceOne.id, sourceTwo.id]],
      );
      await sql.unsafe('delete from work_creators where work_id = any($1::uuid[])', [workIds]);
      await sql.unsafe(
        'delete from work_ingestion_keys where work_id in (select distinct work_id from publications where source_id = any($1::uuid[]))',
        [[sourceOne.id, sourceTwo.id]],
      );
      await sql.unsafe('delete from creators where id = any($1::uuid[])', [creatorIds]);
      await sql.unsafe('delete from publications where source_id = any($1::uuid[])', [
        [sourceOne.id, sourceTwo.id],
      ]);
      await sql.unsafe('delete from source_crawl_states where source_id = any($1::uuid[])', [
        [sourceOne.id, sourceTwo.id],
      ]);
      await sql.unsafe('delete from crawl_runs where source_id = any($1::uuid[])', [
        [sourceOne.id, sourceTwo.id],
      ]);
      await sql.unsafe('delete from sources where id = any($1::uuid[])', [
        [sourceOne.id, sourceTwo.id],
      ]);
      await sql.unsafe('delete from works where id = any($1::uuid[])', [workIds]);
      await catalog.close();
      await ingestion.close();
      await states.close();
      await foundation.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
