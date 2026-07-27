import type {
  TransactionContext,
  VolumeLibraryReadModel,
  VolumeLibraryRepository,
} from '@web-comic-library/application';
import type {
  ContentReadRecord,
  PublicationReadRecord,
  UserVolumeRecord,
  VolumeContentMappingCorrection,
} from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type VolumeRecordRow = Readonly<{
  memoContentUnitId: string | null;
  ownsDigital: boolean;
  ownsPaper: boolean;
  status: UserVolumeRecord['status'];
  userUuid: string;
  visibility: UserVolumeRecord['visibility'];
  volumeEditionId: string;
  workId: string;
}>;

export class PostgresVolumeLibrary implements VolumeLibraryRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async findVolumeReadModel(volumeEditionId: string): Promise<VolumeLibraryReadModel | null> {
    const volumes = await this.#client<{ volumeEditionId: string; workId: string }[]>`
      select id::text as "volumeEditionId", work_id::text as "workId"
      from volume_editions
      where id = ${volumeEditionId}::uuid and retired_at is null
    `;
    const volume = volumes[0];
    if (!volume) return null;
    const [contentUnits, volumeMappings, entryMappings] = await Promise.all([
      this.#client<{ id: string }[]>`
        select id::text from content_units
        where work_id = ${volume.workId}::uuid and retired_at is null
      `,
      this.#client<{ confirmed: boolean; contentUnitId: string }[]>`
        select
          (status = 'confirmed'::volume_content_mapping_status) as confirmed,
          resolve_catalog_redirect(
            'content_unit'::catalog_redirect_resource,
            content_unit_id
          )::text as "contentUnitId"
        from volume_content_mappings
        where volume_edition_id = ${volumeEditionId}::uuid
      `,
      this.#client<{ confirmed: boolean; contentUnitId: string; publicationEntryId: string }[]>`
        select
          mapping.confirmed,
          resolve_catalog_redirect(
            'content_unit'::catalog_redirect_resource,
            mapping.content_unit_id
          )::text as "contentUnitId",
          mapping.publication_entry_id::text as "publicationEntryId"
        from entry_content_mappings as mapping
        join publication_entries as entry on entry.id = mapping.publication_entry_id
        where mapping.work_id = ${volume.workId}::uuid and entry.retired_at is null
      `,
    ]);
    return {
      contentUnitIds: contentUnits.map((contentUnit) => contentUnit.id),
      entryMappings,
      volumeEditionId: volume.volumeEditionId,
      volumeMappings,
      workId: volume.workId,
    };
  }

  async listUserVolumeRecords(userUuid: string): Promise<readonly UserVolumeRecord[]> {
    const rows = await this.#client<VolumeRecordRow[]>`
      select
        user_id as "userUuid",
        volume_edition_id::text as "volumeEditionId",
        resolve_catalog_redirect('work'::catalog_redirect_resource, work_id)::text as "workId",
        status,
        owns_paper as "ownsPaper",
        owns_digital as "ownsDigital",
        case
          when memo_content_unit_id is null then null
          else resolve_catalog_redirect(
            'content_unit'::catalog_redirect_resource,
            memo_content_unit_id
          )::text
        end as "memoContentUnitId",
        visibility
      from user_volume_records
      where user_id = ${userUuid}
      order by updated_at desc, volume_edition_id
    `;
    return rows;
  }

  async saveContentReadRecords(
    context: TransactionContext,
    records: readonly ContentReadRecord[],
  ): Promise<void> {
    if (records.length === 0) return;
    await this.#foundation.withSession(context, async (session) => {
      await Promise.all(
        records.map(
          async (record) => session`
            insert into content_read_records (user_id, work_id, content_unit_id, visibility, read_at)
            values (
              ${record.userUuid},
              resolve_catalog_redirect('work'::catalog_redirect_resource, ${record.workId}::uuid),
              resolve_catalog_redirect('content_unit'::catalog_redirect_resource, ${record.contentUnitId}::uuid),
              ${record.visibility}::visibility, ${record.readAt})
            on conflict (user_id, content_unit_id) do update
            set visibility = excluded.visibility, read_at = excluded.read_at, work_id = excluded.work_id
          `,
        ),
      );
    });
  }

  async savePublicationReadRecords(
    context: TransactionContext,
    records: readonly PublicationReadRecord[],
  ): Promise<void> {
    if (records.length === 0) return;
    await this.#foundation.withSession(context, async (session) => {
      await Promise.all(
        records.map(
          async (record) => session`
            insert into publication_read_records (user_id, work_id, publication_entry_id, visibility, read_at)
            values (
              ${record.userUuid},
              resolve_catalog_redirect('work'::catalog_redirect_resource, ${record.workId}::uuid),
              ${record.publicationEntryId}::uuid,
              ${record.visibility}::visibility, ${record.readAt})
            on conflict (user_id, publication_entry_id) do update
            set visibility = excluded.visibility, read_at = excluded.read_at, work_id = excluded.work_id
          `,
        ),
      );
    });
  }

  async saveUserVolumeRecord(context: TransactionContext, record: UserVolumeRecord): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) =>
        session`
        insert into user_volume_records (
          user_id, volume_edition_id, work_id, status, owns_paper, owns_digital,
          memo_content_unit_id, visibility
        ) values (
          ${record.userUuid}, ${record.volumeEditionId}::uuid,
          resolve_catalog_redirect('work'::catalog_redirect_resource, ${record.workId}::uuid),
          ${record.status}::volume_reading_status, ${record.ownsPaper}, ${record.ownsDigital},
          case
            when ${record.memoContentUnitId}::uuid is null then null
            else resolve_catalog_redirect(
              'content_unit'::catalog_redirect_resource,
              ${record.memoContentUnitId}::uuid
            )
          end,
          ${record.visibility}::visibility
        ) on conflict (user_id, volume_edition_id) do update
        set
          status = excluded.status,
          owns_paper = excluded.owns_paper,
          owns_digital = excluded.owns_digital,
          memo_content_unit_id = excluded.memo_content_unit_id,
          visibility = excluded.visibility,
          updated_at = now()
      `,
    );
  }

  async saveVolumeContentMappingCorrection(
    context: TransactionContext,
    correction: VolumeContentMappingCorrection,
  ): Promise<void> {
    const dedupeKey = [
      'volume-mapping-correction',
      correction.userUuid,
      correction.volumeEditionId,
      correction.contentUnitId,
      correction.suggestedStatus,
    ].join(':');
    await this.#foundation.withSession(
      context,
      (session) =>
        session`
        insert into catalog_review_items (
          id, kind, status, source_id, dedupe_key, payload, created_at
        ) values (
          ${crypto.randomUUID()}, 'user_correction'::catalog_review_kind,
          'open'::catalog_review_status, null, ${dedupeKey},
          ${session.json({
            contentUnitId: correction.contentUnitId,
            rationale: correction.rationale,
            suggestedStatus: correction.suggestedStatus,
            submittedBy: correction.userUuid,
            type: 'volume_content_mapping',
            volumeEditionId: correction.volumeEditionId,
          })}, now()
        ) on conflict (dedupe_key) do nothing
      `,
    );
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresVolumeLibrary = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresVolumeLibrary => new PostgresVolumeLibrary(databaseUrl, foundation);
