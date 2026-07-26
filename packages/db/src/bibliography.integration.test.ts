import { expect, test } from 'bun:test';

import {
  type BibliographyProviderPort,
  type RegisterPublisherProductVolumeCommand,
  registerPublisherProductVolume,
  saveVolumeContentMapping,
  synchronizeVolume,
} from '@web-comic-library/application';
import type { BibliographyProviderRecord } from '@web-comic-library/domain';
import { createContentUnit, createWork } from '@web-comic-library/domain';
import postgres from 'postgres';

import { createPostgresBibliography } from './bibliography';
import { createPostgresCatalog } from './catalog';
import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

const isbn = '9784101001548';
const fetchedAt = new Date('2026-07-27T00:00:00Z');

const record = (
  provider: 'openbd' | 'ndl',
  overrides: Partial<BibliographyProviderRecord> = {},
): BibliographyProviderRecord => ({
  authors: provider === 'openbd' ? ['openBD著者'] : ['NDL著者'],
  cover: null,
  fetchedAt,
  found: true,
  isbn,
  provider,
  publishedAt: '2026-07-01',
  publisher: `${provider}出版社`,
  sourceUrl: `https://${provider}.example/${isbn}`,
  termsUrl: `https://${provider}.example/terms`,
  title: `${provider}書名`,
  ...overrides,
});

const provider = (value: BibliographyProviderRecord): BibliographyProviderPort => ({
  async lookup(): Promise<BibliographyProviderRecord> {
    return value;
  },
});

integrationTest(
  'bibliography storage synchronizes editions, provenance, mappings, deletion, and new-volume events',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const catalog = createPostgresCatalog(databaseUrl);
    const foundation = createPostgresFoundation(databaseUrl);
    const bibliography = createPostgresBibliography(databaseUrl, foundation);
    const work = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '書誌統合テスト作品',
    });
    const otherWork = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'unknown',
      title: '書誌統合テスト別作品',
    });
    const content = createContentUnit({
      id: crypto.randomUUID(),
      position: 0,
      retiredAt: null,
      title: '第1話',
      workId: work.id,
    });
    const foreignContent = createContentUnit({
      id: crypto.randomUUID(),
      position: 0,
      retiredAt: null,
      title: '別作品第1話',
      workId: otherWork.id,
    });

    try {
      await catalog.createWork(work);
      await catalog.createWork(otherWork);
      await catalog.createContentUnit(content);
      await catalog.createContentUnit(foreignContent);

      const initial = await synchronizeVolume(
        foundation,
        bibliography,
        provider(record('openbd')),
        provider(record('ndl')),
        { isbn, mode: 'initial', occurredAt: fetchedAt, workId: work.id },
      );
      expect(initial).toMatchObject({
        created: true,
        notificationSuppressed: true,
        releaseEventCreated: true,
        withdrawn: false,
      });

      const firstRows = await sql<
        { authorProvider: string; publicationStatus: string; titleProvider: string }[]
      >`
        select volume.publication_status as "publicationStatus",
          title_provenance.provider::text as "titleProvider",
          author_provenance.provider::text as "authorProvider"
        from volume_editions as volume
        join volume_field_provenances as title_provenance
          on title_provenance.volume_edition_id = volume.id and title_provenance.field = 'title'
        join volume_field_provenances as author_provenance
          on author_provenance.volume_edition_id = volume.id and author_provenance.field = 'authors'
        where volume.id = ${initial.volumeEditionId}
      `;
      expect([...firstRows]).toEqual([
        { authorProvider: 'openbd', publicationStatus: 'active', titleProvider: 'openbd' },
      ]);
      expect(await bibliography.coverageForIsbns([isbn, '9784101001555'])).toEqual({
        identifiers: 2,
        ndlFound: 1,
        openBdFound: 1,
      });

      const repeat = await synchronizeVolume(
        foundation,
        bibliography,
        provider(record('openbd')),
        provider(record('ndl')),
        {
          isbn,
          mode: 'incremental',
          occurredAt: new Date('2026-07-28T00:00:00Z'),
          workId: work.id,
        },
      );
      expect(repeat).toMatchObject({ created: false, releaseEventCreated: false });

      const publisherCommand: RegisterPublisherProductVolumeCommand = {
        authors: ['出版社著者'],
        coverLicenseUrl: null,
        coverUrl: null,
        fetchedAt,
        mode: 'incremental',
        occurredAt: new Date('2026-07-28T00:00:00Z'),
        publishedAt: '2026-07-02',
        publisher: '出版社',
        publisherProductId: `publisher-product-${crypto.randomUUID()}`,
        sourceUrl: 'https://publisher.example/products/1',
        termsUrl: 'https://publisher.example/terms',
        title: '出版社商品',
        workId: work.id,
      };
      const publisherEdition = await registerPublisherProductVolume(
        foundation,
        bibliography,
        publisherCommand,
      );
      expect(publisherEdition).toMatchObject({
        created: true,
        notificationSuppressed: false,
        releaseEventCreated: true,
      });
      await expect(
        registerPublisherProductVolume(foundation, bibliography, publisherCommand),
      ).resolves.toMatchObject({ created: false, releaseEventCreated: false });

      await saveVolumeContentMapping(foundation, bibliography, {
        contentUnitId: content.id,
        status: 'confirmed',
        volumeEditionId: initial.volumeEditionId,
        workId: work.id,
      });
      await expect(
        saveVolumeContentMapping(foundation, bibliography, {
          contentUnitId: foreignContent.id,
          status: 'confirmed',
          volumeEditionId: initial.volumeEditionId,
          workId: work.id,
        }),
      ).rejects.toThrow();

      const deleted = await synchronizeVolume(
        foundation,
        bibliography,
        provider(
          record('openbd', {
            authors: null,
            found: false,
            publishedAt: null,
            publisher: null,
            title: null,
          }),
        ),
        provider(
          record('ndl', {
            authors: null,
            found: false,
            publishedAt: null,
            publisher: null,
            title: null,
          }),
        ),
        {
          isbn,
          mode: 'incremental',
          occurredAt: new Date('2026-07-29T00:00:00Z'),
          workId: work.id,
        },
      );
      expect(deleted).toMatchObject({ created: false, withdrawn: true });
      const withdrawnRows = await sql<{ publicationStatus: string; retiredAt: Date | null }[]>`
        select publication_status as "publicationStatus", retired_at as "retiredAt"
        from volume_editions where id = ${initial.volumeEditionId}
      `;
      expect([...withdrawnRows]).toEqual([
        { publicationStatus: 'withdrawn', retiredAt: new Date('2026-07-29T00:00:00Z') },
      ]);
    } finally {
      await sql`
        delete from release_events
        where volume_edition_id in (select id from volume_editions where work_id in (${work.id}, ${otherWork.id}))
      `;
      await sql`delete from volume_content_mappings where work_id in (${work.id}, ${otherWork.id})`;
      await sql`delete from volume_field_provenances where volume_edition_id in (select id from volume_editions where work_id in (${work.id}, ${otherWork.id}))`;
      await sql`delete from volume_provider_records where volume_edition_id in (select id from volume_editions where work_id in (${work.id}, ${otherWork.id}))`;
      await sql`delete from volume_editions where work_id in (${work.id}, ${otherWork.id})`;
      await sql`delete from content_units where work_id in (${work.id}, ${otherWork.id})`;
      await sql`delete from works where id in (${work.id}, ${otherWork.id})`;
      await bibliography.close();
      await foundation.close();
      await catalog.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
