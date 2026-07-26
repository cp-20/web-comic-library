import type {
  LibraryRepository,
  LibraryWorkReadModel,
  ReadMapping,
  TransactionContext,
} from '@web-comic-library/application';
import type {
  ContentReadRecord,
  LibraryEntry,
  PublicationReadRecord,
} from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type LibraryEntryRow = Readonly<{
  status: LibraryEntry['status'];
  userUuid: string;
  visibility: LibraryEntry['visibility'];
  workId: string;
}>;

export class PostgresLibrary implements LibraryRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async deleteContentReadRecords(
    context: TransactionContext,
    userUuid: string,
    contentUnitIds: readonly string[],
  ): Promise<void> {
    if (contentUnitIds.length === 0) return;
    await this.#foundation.withSession(context, (session) =>
      session.unsafe(
        'delete from content_read_records where user_id = $1 and content_unit_id = any($2::uuid[])',
        [userUuid, [...contentUnitIds]],
      ),
    );
  }

  async deletePublicationReadRecords(
    context: TransactionContext,
    userUuid: string,
    publicationEntryIds: readonly string[],
  ): Promise<void> {
    if (publicationEntryIds.length === 0) return;
    await this.#foundation.withSession(context, (session) =>
      session.unsafe(
        'delete from publication_read_records where user_id = $1 and publication_entry_id = any($2::uuid[])',
        [userUuid, [...publicationEntryIds]],
      ),
    );
  }

  async findLibraryEntry(userUuid: string, workId: string): Promise<LibraryEntry | null> {
    const rows = await this.#client<LibraryEntryRow[]>`
      select user_id as "userUuid", work_id::text as "workId", status, visibility
      from library_entries where user_id = ${userUuid} and work_id = ${workId}::uuid
    `;
    return rows[0] ?? null;
  }

  async findWorkReadModel(workId: string): Promise<LibraryWorkReadModel | null> {
    const works = await this.#client<{ id: string }[]>`
      select id::text from works where id = ${workId}::uuid and retired_at is null
    `;
    if (!works[0]) return null;
    const mappings = await this.#client<ReadMapping[]>`
      select content_unit_id::text as "contentUnitId", publication_entry_id::text as "publicationEntryId", confirmed
      from entry_content_mappings where work_id = ${workId}::uuid
    `;
    const contentUnits = await this.#client<{ id: string; position: number }[]>`
      select id::text, position from content_units
      where work_id = ${workId}::uuid and retired_at is null order by position, id
    `;
    const publicationEntries = await this.#client<{ id: string }[]>`
      select id::text from publication_entries
      where work_id = ${workId}::uuid and retired_at is null
    `;
    const catchUpRows = await this.#client<{ contentUnitId: string }[]>`
      select distinct mapping.content_unit_id::text as "contentUnitId"
      from entry_content_mappings as mapping
      join publication_entries as entry on entry.id = mapping.publication_entry_id
      where mapping.work_id = ${workId}::uuid and mapping.confirmed
        and entry.retired_at is null and entry.kind in ('regular', 'extra')
    `;
    return {
      catchUpContentUnitIds: catchUpRows.map((row) => row.contentUnitId),
      contentUnits,
      mappings,
      publicationEntryIds: publicationEntries.map((entry) => entry.id),
      workId,
    };
  }

  async listReadContentUnitIds(userUuid: string, workId: string): Promise<readonly string[]> {
    const rows = await this.#client<{ contentUnitId: string }[]>`
      select content_unit_id::text as "contentUnitId" from content_read_records
      where user_id = ${userUuid} and work_id = ${workId}::uuid
    `;
    return rows.map((row) => row.contentUnitId);
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
          values (${record.userUuid}, ${record.workId}::uuid, ${record.contentUnitId}::uuid,
            ${record.visibility}::visibility, ${record.readAt})
          on conflict (user_id, content_unit_id) do update
          set visibility = excluded.visibility, read_at = excluded.read_at, work_id = excluded.work_id
        `,
        ),
      );
    });
  }

  async saveLibraryEntry(
    context: TransactionContext,
    entry: LibraryEntry,
    changedAt: Date,
  ): Promise<void> {
    await this.#foundation.withSession(context, async (session) => {
      await session`
        insert into library_entries (user_id, work_id, status, visibility)
        values (${entry.userUuid}, ${entry.workId}::uuid, ${entry.status}::reading_status,
          ${entry.visibility}::visibility)
        on conflict (user_id, work_id) do update
        set status = excluded.status, visibility = excluded.visibility, updated_at = now()
      `;
      await session`
        insert into library_status_history (user_id, work_id, status, changed_at)
        values (${entry.userUuid}, ${entry.workId}::uuid, ${entry.status}::reading_status, ${changedAt})
      `;
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
          values (${record.userUuid}, ${record.workId}::uuid, ${record.publicationEntryId}::uuid,
            ${record.visibility}::visibility, ${record.readAt})
          on conflict (user_id, publication_entry_id) do update
          set visibility = excluded.visibility, read_at = excluded.read_at, work_id = excluded.work_id
        `,
        ),
      );
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresLibrary = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresLibrary => new PostgresLibrary(databaseUrl, foundation);
