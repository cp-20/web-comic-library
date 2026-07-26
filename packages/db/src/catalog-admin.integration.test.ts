import { expect, test } from 'bun:test';

import {
  mergeContentUnits,
  mergeWorks,
  splitContentUnit,
  splitWork,
} from '@web-comic-library/application';
import {
  createContentUnit,
  createEntryContentMapping,
  createPublication,
  createPublicationEntry,
  createSource,
  createWork,
} from '@web-comic-library/domain';
import postgres from 'postgres';

import { createPostgresCatalog } from './catalog';
import { createPostgresCatalogAdmin } from './catalog-admin';
import { createPostgresConnectorState } from './connector-state';
import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

const actor = {
  assurance: 'passkey' as const,
  id: 'catalog-admin-test',
  role: 'administrator' as const,
};

integrationTest(
  'catalog administration merges, splits, redirects, audits, and queues review work transactionally',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const catalog = createPostgresCatalog(databaseUrl);
    const foundation = createPostgresFoundation(databaseUrl);
    const admin = createPostgresCatalogAdmin(databaseUrl, foundation);
    const states = createPostgresConnectorState(databaseUrl, foundation);
    const sql = postgres(databaseUrl, { max: 1 });
    const source = createSource({
      baseUrl: 'https://catalog-admin-test.example/',
      id: crypto.randomUUID(),
      key: `catalog-admin-${crypto.randomUUID()}`,
      name: '管理試験掲載元',
    });
    const sourceWork = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '統合元作品',
    });
    const targetWork = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '正規作品',
    });
    const sourcePublication = createPublication({
      ageRatingValue: null,
      externalId: `source-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'official',
      normalizedUrl: `https://catalog-admin-test.example/source/${crypto.randomUUID()}`,
      purchaseUrl: null,
      retiredAt: null,
      sourceId: source.id,
      title: '統合元掲載',
      workId: sourceWork.id,
    });
    const targetPublication = createPublication({
      ageRatingValue: null,
      externalId: `target-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'official',
      normalizedUrl: `https://catalog-admin-test.example/target/${crypto.randomUUID()}`,
      purchaseUrl: null,
      retiredAt: null,
      sourceId: source.id,
      title: '正規掲載',
      workId: targetWork.id,
    });
    const sourceEntry = createPublicationEntry({
      externalId: `entry-source-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'regular',
      normalizedUrl: `https://catalog-admin-test.example/entry/source/${crypto.randomUUID()}`,
      position: 1,
      publishedAt: null,
      publicationId: sourcePublication.id,
      retiredAt: null,
      title: '第1話',
      workId: sourceWork.id,
    });
    const targetEntry = createPublicationEntry({
      externalId: `entry-target-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'regular',
      normalizedUrl: `https://catalog-admin-test.example/entry/target/${crypto.randomUUID()}`,
      position: 1,
      publishedAt: null,
      publicationId: targetPublication.id,
      retiredAt: null,
      title: '第1話',
      workId: targetWork.id,
    });
    const sourceContent = createContentUnit({
      id: crypto.randomUUID(),
      position: 1,
      retiredAt: null,
      title: '第1話',
      workId: sourceWork.id,
    });
    const targetContent = createContentUnit({
      id: crypto.randomUUID(),
      position: 1,
      retiredAt: null,
      title: '第1話',
      workId: targetWork.id,
    });
    let reconstructedWorkId: string | null = null;

    try {
      await catalog.createSource(source);
      await catalog.createWork(sourceWork);
      await catalog.createWork(targetWork);
      await catalog.createPublication(sourcePublication);
      await catalog.createPublication(targetPublication);
      await catalog.createPublicationEntry(sourceEntry);
      await catalog.createPublicationEntry(targetEntry);
      await catalog.createContentUnit(sourceContent);
      await catalog.createContentUnit(targetContent);
      await catalog.mapEntryToContent(createEntryContentMapping(sourceEntry, sourceContent, true));
      await catalog.mapEntryToContent(createEntryContentMapping(targetEntry, targetContent, true));

      await mergeWorks(foundation, admin, {
        actor,
        reason: '同一作品の重複掲載を統合する',
        sourceWorkId: sourceWork.id,
        targetWorkId: targetWork.id,
      });
      expect(await admin.findRedirect('work', sourceWork.id)).toEqual({
        canonicalId: targetWork.id,
        resource: 'work',
      });
      const mergedRows = await sql<{ contentUnits: number; publications: number }[]>`
        select
          (select count(*)::int from publications where work_id = ${targetWork.id}) as publications,
          (select count(*)::int from content_units where work_id = ${targetWork.id}) as "contentUnits"
      `;
      expect(mergedRows[0]).toEqual({ contentUnits: 2, publications: 2 });

      await mergeContentUnits(foundation, admin, {
        actor,
        reason: '同じ話を一つに統合する',
        sourceContentUnitId: sourceContent.id,
        targetContentUnitId: targetContent.id,
      });
      expect(await admin.findRedirect('content_unit', sourceContent.id)).toEqual({
        canonicalId: targetContent.id,
        resource: 'content_unit',
      });

      await splitContentUnit(foundation, admin, {
        actor,
        entryIds: [sourceEntry.id],
        position: 2,
        reason: '分割掲載の話を分離する',
        sourceContentUnitId: targetContent.id,
        title: '第1話 前編',
      });
      const splitContentRows = await sql<{ count: number }[]>`
        select count(*)::int as count
        from content_units
        where work_id = ${targetWork.id}
          and retired_at is null
      `;
      expect(splitContentRows[0]?.count).toBe(2);

      const splitPublication = createPublication({
        ageRatingValue: null,
        externalId: `split-${crypto.randomUUID()}`,
        id: crypto.randomUUID(),
        kind: 'official',
        normalizedUrl: `https://catalog-admin-test.example/split/${crypto.randomUUID()}`,
        purchaseUrl: null,
        retiredAt: null,
        sourceId: source.id,
        title: '分離掲載',
        workId: targetWork.id,
      });
      const splitEntry = createPublicationEntry({
        externalId: `entry-split-${crypto.randomUUID()}`,
        id: crypto.randomUUID(),
        kind: 'regular',
        normalizedUrl: `https://catalog-admin-test.example/entry/split/${crypto.randomUUID()}`,
        position: 3,
        publishedAt: null,
        publicationId: splitPublication.id,
        retiredAt: null,
        title: '第3話',
        workId: targetWork.id,
      });
      const splitContent = createContentUnit({
        id: crypto.randomUUID(),
        position: 3,
        retiredAt: null,
        title: '第3話',
        workId: targetWork.id,
      });
      await catalog.createPublication(splitPublication);
      await catalog.createPublicationEntry(splitEntry);
      await catalog.createContentUnit(splitContent);
      await catalog.mapEntryToContent(createEntryContentMapping(splitEntry, splitContent, true));
      const splitAudit = await splitWork(foundation, admin, {
        actor,
        contentUnitIds: [splitContent.id],
        publicationIds: [splitPublication.id],
        reason: '誤統合された掲載関係を復元する',
        serialStatus: 'ongoing',
        sourceWorkId: targetWork.id,
        title: '分割後作品',
      });
      const splitResult = splitAudit.after;
      if (
        typeof splitResult !== 'object' ||
        splitResult === null ||
        Array.isArray(splitResult) ||
        typeof splitResult.newWorkId !== 'string'
      ) {
        throw new Error('split work audit is missing its new work ID');
      }
      reconstructedWorkId = splitResult.newWorkId;
      const reconstructed = await sql<{ count: number }[]>`
        select count(*)::int as count
        from works
        where title = '分割後作品'
          and retired_at is null
      `;
      expect(reconstructed[0]?.count).toBe(1);

      await states.recordFailure(
        {
          durationMs: 1,
          failureCode: 'parse',
          finishedAt: new Date('2026-07-27T00:00:10Z'),
          id: crypto.randomUUID(),
          parseFailureCount: 1,
          sourceId: source.id,
          startedAt: new Date('2026-07-27T00:00:09Z'),
          successCount: 0,
        },
        3,
      );
      expect((await admin.listReviewItems()).map((item) => item.kind)).toContain('parse_failure');
      expect((await admin.findAuditRecords(10)).map((item) => item.operation)).toEqual(
        expect.arrayContaining([
          'merge_work',
          'merge_content_unit',
          'split_content_unit',
          'split_work',
        ]),
      );
    } finally {
      if (reconstructedWorkId) {
        await sql`delete from entry_content_mappings where work_id = ${reconstructedWorkId}`;
        await sql`delete from publication_entries where work_id = ${reconstructedWorkId}`;
        await sql`delete from content_units where work_id = ${reconstructedWorkId}`;
        await sql`delete from publications where work_id = ${reconstructedWorkId}`;
        await sql`delete from work_creators where work_id = ${reconstructedWorkId}`;
        await sql`delete from work_aliases where work_id = ${reconstructedWorkId}`;
        await sql`delete from work_ingestion_keys where work_id = ${reconstructedWorkId}`;
        await sql`delete from works where id = ${reconstructedWorkId}`;
      }
      await sql`delete from catalog_merge_audits where operator_id = ${actor.id}`;
      await sql`delete from catalog_redirects where source_id in (${sourceWork.id}, ${sourceContent.id})`;
      await sql`delete from catalog_review_items where source_id = ${source.id}`;
      await sql`delete from entry_content_mappings where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from publication_entries where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from content_units where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from publications where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from work_creators where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from work_aliases where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from work_ingestion_keys where work_id in (${sourceWork.id}, ${targetWork.id})`;
      await sql`delete from source_crawl_states where source_id = ${source.id}`;
      await sql`delete from crawl_runs where source_id = ${source.id}`;
      await sql`delete from sources where id = ${source.id}`;
      await sql`delete from works where id in (${sourceWork.id}, ${targetWork.id})`;
      await catalog.close();
      await admin.close();
      await states.close();
      await foundation.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
