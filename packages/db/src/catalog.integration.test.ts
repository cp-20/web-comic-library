import { expect, test } from 'bun:test';

import {
  createContentUnit,
  createCreator,
  createEntryContentMapping,
  createPublication,
  createPublicationEntry,
  createSource,
  createWork,
  createWorkAlias,
  createWorkCreator,
} from '@web-comic-library/domain';
import postgres from 'postgres';

import { createPostgresCatalog } from './catalog';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'catalog storage preserves identities, uniqueness, mappings, and catch-up entries',
  async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const catalog = createPostgresCatalog(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const work = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '統合テスト作品',
    });
    const otherWork = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'unknown',
      title: '猫',
    });
    const sameTitleWork = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '統合テスト作品',
    });
    const source = createSource({
      baseUrl: 'https://catalog-test.example/',
      id: crypto.randomUUID(),
      key: `catalog-test-${crypto.randomUUID()}`,
      name: '統合テスト掲載元',
    });
    const creator = createCreator({
      id: crypto.randomUUID(),
      name: 'テスト作者',
    });
    const firstPublication = createPublication({
      ageRatingValue: null,
      externalId: `work-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'official',
      normalizedUrl: `https://catalog-test.example/works/${crypto.randomUUID()}`,
      purchaseUrl: null,
      retiredAt: null,
      sourceId: source.id,
      title: '掲載先A',
      workId: work.id,
    });
    const secondPublication = createPublication({
      ageRatingValue: null,
      externalId: `work-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'official',
      normalizedUrl: `https://catalog-test.example/works/${crypto.randomUUID()}`,
      purchaseUrl: null,
      retiredAt: null,
      sourceId: source.id,
      title: '掲載先B',
      workId: work.id,
    });
    const firstContentUnit = createContentUnit({
      id: crypto.randomUUID(),
      position: 0,
      retiredAt: null,
      title: '第1話 前半',
      workId: work.id,
    });
    const secondContentUnit = createContentUnit({
      id: crypto.randomUUID(),
      position: 1,
      retiredAt: null,
      title: '第1話 後半',
      workId: work.id,
    });
    const foreignContentUnit = createContentUnit({
      id: crypto.randomUUID(),
      position: 0,
      retiredAt: null,
      title: '別作品 第1話',
      workId: otherWork.id,
    });
    const combinedEntry = createPublicationEntry({
      externalId: `entry-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'regular',
      normalizedUrl: `https://catalog-test.example/entries/${crypto.randomUUID()}`,
      position: 0,
      publicationId: firstPublication.id,
      publishedAt: new Date('2026-07-25T00:00:00Z'),
      retiredAt: null,
      title: '第1話 一括版',
      workId: work.id,
    });
    const splitEntry = createPublicationEntry({
      externalId: `entry-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'extra',
      normalizedUrl: `https://catalog-test.example/entries/${crypto.randomUUID()}`,
      position: 0,
      publicationId: secondPublication.id,
      publishedAt: new Date('2026-07-25T01:00:00Z'),
      retiredAt: null,
      title: '第1話 後半 別掲載',
      workId: work.id,
    });
    const announcement = createPublicationEntry({
      externalId: `entry-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      kind: 'announcement',
      normalizedUrl: `https://catalog-test.example/entries/${crypto.randomUUID()}`,
      position: 1,
      publicationId: firstPublication.id,
      publishedAt: null,
      retiredAt: null,
      title: '単行本のお知らせ',
      workId: work.id,
    });

    try {
      await catalog.createWork(work);
      await catalog.createWork(otherWork);
      await catalog.createWork(sameTitleWork);
      await catalog.addWorkAlias(
        createWorkAlias({
          id: crypto.randomUUID(),
          kind: 'reading',
          value: 'とうごうてすとさくひん',
          workId: work.id,
        }),
      );
      await catalog.createCreator(creator);
      await catalog.addWorkCreator(
        createWorkCreator({
          creatorId: creator.id,
          position: 0,
          role: '漫画',
          workId: work.id,
        }),
      );
      await catalog.createSource(source);
      await catalog.createPublication(firstPublication);
      await catalog.createPublication(secondPublication);

      await expect(
        catalog.createPublication({
          ...firstPublication,
          id: crypto.randomUUID(),
          normalizedUrl: `https://catalog-test.example/works/${crypto.randomUUID()}`,
        }),
      ).rejects.toThrow();
      await expect(
        catalog.createPublication({
          ...firstPublication,
          externalId: `work-${crypto.randomUUID()}`,
          id: crypto.randomUUID(),
        }),
      ).rejects.toThrow();

      await catalog.createContentUnit(firstContentUnit);
      await catalog.createContentUnit(secondContentUnit);
      await catalog.createContentUnit(foreignContentUnit);
      await catalog.createPublicationEntry(combinedEntry);
      await catalog.createPublicationEntry(splitEntry);
      await catalog.createPublicationEntry(announcement);

      await expect(
        catalog.createPublicationEntry({
          ...combinedEntry,
          id: crypto.randomUUID(),
          normalizedUrl: `https://catalog-test.example/entries/${crypto.randomUUID()}`,
        }),
      ).rejects.toThrow();
      await expect(
        catalog.createPublicationEntry({
          ...combinedEntry,
          externalId: `entry-${crypto.randomUUID()}`,
          id: crypto.randomUUID(),
        }),
      ).rejects.toThrow();

      await catalog.mapEntryToContent(
        createEntryContentMapping(combinedEntry, firstContentUnit, true),
      );
      await catalog.mapEntryToContent(
        createEntryContentMapping(combinedEntry, secondContentUnit, true),
      );
      await catalog.mapEntryToContent(
        createEntryContentMapping(splitEntry, secondContentUnit, true),
      );
      await expect(
        catalog.mapEntryToContent({
          confirmed: false,
          contentUnitId: foreignContentUnit.id,
          publicationEntryId: combinedEntry.id,
          workId: work.id,
        }),
      ).rejects.toThrow();

      const readModel = await catalog.findWork(work.id);
      expect(readModel?.aliases).toEqual(['とうごうてすとさくひん']);
      expect(readModel?.creators).toEqual([
        {
          id: creator.id,
          name: 'テスト作者',
          position: 0,
          role: '漫画',
        },
      ]);
      expect(readModel?.publications).toHaveLength(2);
      expect(
        readModel?.publications
          .flatMap((publication) => publication.entries)
          .find((entry) => entry.id === combinedEntry.id)?.mappings,
      ).toHaveLength(2);
      expect(
        readModel?.publications
          .flatMap((publication) => publication.entries)
          .filter((entry) =>
            entry.mappings.some((mapping) => mapping.contentUnitId === secondContentUnit.id),
          ),
      ).toHaveLength(2);

      const catchUpEntries = await catalog.listCatchUpEntries(work.id);
      expect(catchUpEntries.map((entry) => entry.kind).toSorted()).toEqual(['extra', 'regular']);

      expect(
        await catalog.searchWorkIds({
          kind: 'official',
          query: '統合テスト',
          sort: 'recent',
          sourceKey: source.key,
          status: 'ongoing',
        }),
      ).toEqual([work.id]);
      expect(
        await catalog.searchWorkIds({
          kind: null,
          query: '統合テスト',
          sort: 'recent',
          sourceKey: null,
          status: 'ongoing',
        }),
      ).toEqual(expect.arrayContaining([work.id, sameTitleWork.id]));
      expect(
        await catalog.searchWorkIds({
          kind: null,
          query: 'とうごうてすと',
          sort: 'popular',
          sourceKey: null,
          status: null,
        }),
      ).toContain(work.id);
      expect(
        await catalog.searchWorkIds({
          kind: null,
          query: 'テスト作者',
          sort: 'new',
          sourceKey: null,
          status: null,
        }),
      ).toContain(work.id);
      expect(
        await catalog.searchWorkIds({
          kind: null,
          query: '猫',
          sort: 'recent',
          sourceKey: null,
          status: 'unknown',
        }),
      ).toEqual([otherWork.id]);
    } finally {
      await sql`
        delete from entry_content_mappings
        where work_id in (${work.id}, ${otherWork.id})
      `;
      await sql`
        delete from publication_entries
        where work_id in (${work.id}, ${otherWork.id})
      `;
      await sql`
        delete from content_units
        where work_id in (${work.id}, ${otherWork.id})
      `;
      await sql`
        delete from publications
        where work_id in (${work.id}, ${otherWork.id})
      `;
      await sql`delete from work_creators where work_id in (${work.id}, ${otherWork.id})`;
      await sql`delete from work_aliases where work_id in (${work.id}, ${otherWork.id})`;
      await sql`delete from creators where id = ${creator.id}`;
      await sql`delete from sources where id = ${source.id}`;
      await sql`delete from works where id in (${work.id}, ${otherWork.id}, ${sameTitleWork.id})`;
      await catalog.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
