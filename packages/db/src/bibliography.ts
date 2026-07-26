import type {
  BibliographyCoverageReport,
  BibliographyRepository,
  PublisherProductVolumeSynchronization,
  SynchronizeVolumeResult,
  TransactionContext,
  VolumeSynchronization,
} from '@web-comic-library/application';
import type { VolumeContentMapping } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';

import { enqueueNotificationRelease, type PostgresFoundation } from './foundation';

type VolumeRow = Readonly<{ id: string; workId: string }>;

export class PostgresBibliography implements BibliographyRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async coverageForIsbns(isbns: readonly string[]): Promise<BibliographyCoverageReport> {
    if (isbns.length === 0) return { identifiers: 0, ndlFound: 0, openBdFound: 0 };
    const rows = await this.#client<{ ndlFound: number; openBdFound: number }[]>`
      select
        count(*) filter (where ndl.found)::int as "ndlFound",
        count(*) filter (where openbd.found)::int as "openBdFound"
      from volume_editions as volume
      left join volume_provider_records as openbd
        on openbd.volume_edition_id = volume.id and openbd.provider = 'openbd'
      left join volume_provider_records as ndl
        on ndl.volume_edition_id = volume.id and ndl.provider = 'ndl'
      where volume.isbn = any(${[...isbns]})
    `;
    const row = rows[0];
    return {
      identifiers: isbns.length,
      ndlFound: row?.ndlFound ?? 0,
      openBdFound: row?.openBdFound ?? 0,
    };
  }

  async saveSynchronization(
    context: TransactionContext,
    synchronization: VolumeSynchronization,
  ): Promise<SynchronizeVolumeResult> {
    return this.#foundation.withSession(context, async (session) => {
      const isbn = synchronization.providers[0]?.isbn;
      if (!isbn) throw new Error('synchronization must contain provider records');
      const existingRows = await session<VolumeRow[]>`
        select id::text, work_id::text as "workId"
        from volume_editions
        where isbn = ${isbn}
        for update
      `;
      const existing = existingRows[0];
      if (existing && existing.workId !== synchronization.workId) {
        throw new Error('ISBN already belongs to another work');
      }
      if (!existing && !synchronization.resolved) {
        throw new Error('cannot create a volume edition without bibliography metadata');
      }

      const volumeEditionId = existing?.id ?? crypto.randomUUID();
      const withdrawn = synchronization.providers.some(
        (record) => record.provider === 'openbd' && !record.found,
      );
      if (!existing) {
        const resolved = synchronization.resolved;
        if (!resolved) throw new Error('resolved bibliography is required');
        await session`
          insert into volume_editions (
            id, work_id, isbn, publisher_product_id, title, authors, publisher, published_at,
            cover_url, cover_license_url, publication_status, retired_at
          ) values (
            ${volumeEditionId}, ${synchronization.workId}, ${isbn}, null,
            ${resolved.title.value}, ${[...resolved.authors.value]}, ${resolved.publisher?.value ?? null},
            ${resolved.publishedAt?.value ?? null}, ${resolved.cover?.value.url ?? null},
            ${resolved.cover?.value.licenseUrl ?? null}, 'active'::volume_publication_status, null
          )
        `;
      } else if (withdrawn) {
        await session`
          update volume_editions
          set publication_status = 'withdrawn'::volume_publication_status,
              retired_at = ${synchronization.occurredAt}, updated_at = now()
          where id = ${volumeEditionId}
        `;
      } else if (synchronization.resolved) {
        const resolved = synchronization.resolved;
        await session`
          update volume_editions
          set title = ${resolved.title.value}, authors = ${[...resolved.authors.value]},
              publisher = ${resolved.publisher?.value ?? null}, published_at = ${resolved.publishedAt?.value ?? null},
              cover_url = ${resolved.cover?.value.url ?? null}, cover_license_url = ${resolved.cover?.value.licenseUrl ?? null},
              publication_status = 'active'::volume_publication_status, retired_at = null, updated_at = now()
          where id = ${volumeEditionId}
        `;
      }

      for (const record of synchronization.providers) {
        // oxlint-disable-next-line no-await-in-loop -- Provider records must be persisted in the enclosing transaction.
        await session`
          insert into volume_provider_records (volume_edition_id, provider, found, fetched_at, source_url, terms_url)
          values (${volumeEditionId}, ${record.provider}::bibliography_provider, ${record.found}, ${record.fetchedAt}, ${record.sourceUrl}, ${record.termsUrl})
          on conflict (volume_edition_id, provider) do update
          set found = excluded.found, fetched_at = excluded.fetched_at, source_url = excluded.source_url, terms_url = excluded.terms_url
        `;
      }
      if (synchronization.resolved) {
        await this.#saveProvenance(session, volumeEditionId, synchronization.resolved);
      }

      const notificationSuppressed = synchronization.mode === 'initial';
      let releaseEventCreated = false;
      if (!existing && !withdrawn) {
        const rows = await session<{ id: string }[]>`
          insert into release_events (
            id, idempotency_key, source_id, publication_entry_id, volume_edition_id,
            bibliography_provider, kind, occurred_at, notification_suppressed
          ) values (
            ${crypto.randomUUID()}, ${`volume:${volumeEditionId}:new_volume:${synchronization.occurredAt.toISOString()}`},
            null, null, ${volumeEditionId}, 'openbd'::bibliography_provider,
            'new_volume'::release_event_kind, ${synchronization.occurredAt}, ${notificationSuppressed}
          ) on conflict (idempotency_key) do nothing returning id::text
        `;
        releaseEventCreated = rows.length === 1;
        const eventId = rows[0]?.id;
        if (eventId && synchronization.mode === 'incremental') {
          await enqueueNotificationRelease(session, eventId);
        }
      }
      return {
        created: !existing,
        notificationSuppressed,
        releaseEventCreated,
        volumeEditionId,
        withdrawn,
      };
    });
  }

  async savePublisherProductVolume(
    context: TransactionContext,
    synchronization: PublisherProductVolumeSynchronization,
  ): Promise<SynchronizeVolumeResult> {
    return this.#foundation.withSession(context, async (session) => {
      const existingRows = await session<VolumeRow[]>`
        select id::text, work_id::text as "workId"
        from volume_editions
        where publisher_product_id = ${synchronization.publisherProductId}
        for update
      `;
      const existing = existingRows[0];
      if (existing && existing.workId !== synchronization.workId) {
        throw new Error('publisher product ID already belongs to another work');
      }
      const volumeEditionId = existing?.id ?? crypto.randomUUID();
      if (!existing) {
        await session`
          insert into volume_editions (
            id, work_id, isbn, publisher_product_id, title, authors, publisher, published_at,
            cover_url, cover_license_url, publication_status, retired_at
          ) values (
            ${volumeEditionId}, ${synchronization.workId}, null, ${synchronization.publisherProductId},
            ${synchronization.title}, ${[...synchronization.authors]}, ${synchronization.publisher},
            ${synchronization.publishedAt}, ${synchronization.coverUrl}, ${synchronization.coverLicenseUrl},
            'active'::volume_publication_status, null
          )
        `;
      } else {
        await session`
          update volume_editions
          set title = ${synchronization.title}, authors = ${[...synchronization.authors]},
              publisher = ${synchronization.publisher}, published_at = ${synchronization.publishedAt},
              cover_url = ${synchronization.coverUrl}, cover_license_url = ${synchronization.coverLicenseUrl},
              publication_status = 'active'::volume_publication_status, retired_at = null, updated_at = now()
          where id = ${volumeEditionId}
        `;
      }
      await session`
        insert into volume_provider_records (volume_edition_id, provider, found, fetched_at, source_url, terms_url)
        values (${volumeEditionId}, 'publisher'::bibliography_provider, true, ${synchronization.fetchedAt}, ${synchronization.sourceUrl}, ${synchronization.termsUrl})
        on conflict (volume_edition_id, provider) do update
        set found = excluded.found, fetched_at = excluded.fetched_at, source_url = excluded.source_url, terms_url = excluded.terms_url
      `;
      await this.#savePublisherProvenance(session, volumeEditionId, synchronization);
      const notificationSuppressed = synchronization.mode === 'initial';
      let releaseEventCreated = false;
      if (!existing) {
        const rows = await session<{ id: string }[]>`
          insert into release_events (
            id, idempotency_key, source_id, publication_entry_id, volume_edition_id,
            bibliography_provider, kind, occurred_at, notification_suppressed
          ) values (
            ${crypto.randomUUID()}, ${`volume:${volumeEditionId}:new_volume:${synchronization.occurredAt.toISOString()}`},
            null, null, ${volumeEditionId}, 'publisher'::bibliography_provider,
            'new_volume'::release_event_kind, ${synchronization.occurredAt}, ${notificationSuppressed}
          ) on conflict (idempotency_key) do nothing returning id::text
        `;
        releaseEventCreated = rows.length === 1;
        const eventId = rows[0]?.id;
        if (eventId && synchronization.mode === 'incremental') {
          await enqueueNotificationRelease(session, eventId);
        }
      }
      return {
        created: !existing,
        notificationSuppressed,
        releaseEventCreated,
        volumeEditionId,
        withdrawn: false,
      };
    });
  }

  async saveVolumeContentMapping(
    context: TransactionContext,
    mapping: VolumeContentMapping,
  ): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) => session`
      insert into volume_content_mappings (volume_edition_id, content_unit_id, work_id, status)
      values (${mapping.volumeEditionId}, ${mapping.contentUnitId}, ${mapping.workId}, ${mapping.status}::volume_content_mapping_status)
      on conflict (volume_edition_id, content_unit_id) do update set status = excluded.status, updated_at = now()
    `,
    );
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }

  async #saveProvenance(
    session: TransactionSql,
    volumeEditionId: string,
    resolved: NonNullable<VolumeSynchronization['resolved']>,
  ): Promise<void> {
    const fields = [
      ['title', resolved.title] as const,
      ['authors', resolved.authors] as const,
      ['publisher', resolved.publisher] as const,
      ['published_at', resolved.publishedAt] as const,
      ['cover', resolved.cover] as const,
    ];
    for (const [field, value] of fields) {
      if (!value) continue;
      // oxlint-disable-next-line no-await-in-loop -- Provenance rows share the enclosing transaction.
      await session`
        insert into volume_field_provenances (volume_edition_id, field, provider, value, fetched_at, terms_url)
        values (${volumeEditionId}, ${field}::bibliography_field, ${value.provider}::bibliography_provider, ${session.json(value.value)}, ${value.fetchedAt}, ${value.termsUrl})
        on conflict (volume_edition_id, field, provider) do update
        set value = excluded.value, fetched_at = excluded.fetched_at, terms_url = excluded.terms_url
      `;
    }
  }

  async #savePublisherProvenance(
    session: TransactionSql,
    volumeEditionId: string,
    synchronization: PublisherProductVolumeSynchronization,
  ): Promise<void> {
    const fields = [
      ['title', synchronization.title],
      ['authors', [...synchronization.authors]],
      ['publisher', synchronization.publisher],
      ['published_at', synchronization.publishedAt],
      [
        'cover',
        synchronization.coverUrl && synchronization.coverLicenseUrl
          ? { licenseUrl: synchronization.coverLicenseUrl, url: synchronization.coverUrl }
          : null,
      ],
    ] as const;
    for (const [field, value] of fields) {
      if (value === null) continue;
      // oxlint-disable-next-line no-await-in-loop -- Provenance rows share the enclosing transaction.
      await session`
        insert into volume_field_provenances (volume_edition_id, field, provider, value, fetched_at, terms_url)
        values (${volumeEditionId}, ${field}::bibliography_field, 'publisher'::bibliography_provider, ${session.json(value)}, ${synchronization.fetchedAt}, ${synchronization.termsUrl})
        on conflict (volume_edition_id, field, provider) do update
        set value = excluded.value, fetched_at = excluded.fetched_at, terms_url = excluded.terms_url
      `;
    }
  }
}

export const createPostgresBibliography = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresBibliography => new PostgresBibliography(databaseUrl, foundation);
