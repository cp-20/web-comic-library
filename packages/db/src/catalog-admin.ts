import type {
  CatalogAdminRepository,
  CatalogAuditRecord,
  CatalogRedirect,
  CatalogReviewItem,
  MergeContentUnitsCommand,
  MergeWorksCommand,
  SplitContentUnitCommand,
  SplitWorkCommand,
  TransactionContext,
  JsonValue,
} from '@web-comic-library/application';
import type { CatalogAdminActor } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type WorkRow = Readonly<{ id: string; retiredAt: Date | null; title: string }>;
type ContentUnitRow = Readonly<{
  id: string;
  position: number;
  retiredAt: Date | null;
  title: string;
  workId: string;
}>;
type AuditRow = Readonly<{
  after: JsonValue;
  before: JsonValue;
  createdAt: Date;
  id: string;
  operation: CatalogAuditRecord['operation'];
  operatorId: string;
  reason: string;
}>;
type ReviewRow = Readonly<{
  createdAt: Date;
  id: string;
  kind: CatalogReviewItem['kind'];
  payload: JsonValue;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  sourceId: string | null;
  status: CatalogReviewItem['status'];
}>;

const requireActive = <T extends WorkRow | ContentUnitRow>(
  row: T | undefined,
  resource: string,
): T => {
  if (!row || row.retiredAt !== null) {
    throw new Error(`${resource} must exist and be active`);
  }

  return row;
};

const auditRecord = (
  operation: CatalogAuditRecord['operation'],
  actor: CatalogAdminActor,
  reason: string,
  before: JsonValue,
  after: JsonValue,
): CatalogAuditRecord => ({
  after,
  before,
  createdAt: new Date(),
  id: crypto.randomUUID(),
  operation,
  operatorId: actor.id,
  reason,
});

export class PostgresCatalogAdmin implements CatalogAdminRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async findAuditRecords(limit: number): Promise<readonly CatalogAuditRecord[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('audit limit must be between 1 and 100');
    }

    const rows = await this.#client<AuditRow[]>`
      select
        id::text,
        operation,
        operator_id as "operatorId",
        reason,
        before_data as before,
        after_data as after,
        created_at as "createdAt"
      from catalog_merge_audits
      order by created_at desc, id desc
      limit ${limit}
    `;
    return rows;
  }

  async findRedirect(
    resource: CatalogRedirect['resource'],
    id: string,
  ): Promise<CatalogRedirect | null> {
    const rows = await this.#client<{ targetId: string }[]>`
      select target_id::text as "targetId"
      from catalog_redirects
      where resource = ${resource}::catalog_redirect_resource
        and source_id = ${id}
    `;
    const redirect = rows[0];
    return redirect ? { canonicalId: redirect.targetId, resource } : null;
  }

  async listReviewItems(): Promise<readonly CatalogReviewItem[]> {
    const rows = await this.#client<ReviewRow[]>`
      select
        id::text,
        kind,
        status,
        source_id::text as "sourceId",
        payload,
        created_at as "createdAt",
        resolved_at as "resolvedAt",
        resolved_by as "resolvedBy"
      from catalog_review_items
      where status = 'open'
      order by created_at asc, id asc
    `;
    return rows;
  }

  async mergeWorks(
    context: TransactionContext,
    command: MergeWorksCommand,
  ): Promise<CatalogAuditRecord> {
    return this.#foundation.withSession(context, async (session) => {
      await this.#deferCatalogConstraints(session);
      const rows = await session.unsafe<WorkRow[]>(
        'select id::text, title, retired_at as "retiredAt" from works where id = any($1::uuid[]) for update',
        [[command.sourceWorkId, command.targetWorkId]],
      );
      const source = requireActive(
        rows.find((row) => row.id === command.sourceWorkId),
        'source work',
      );
      const target = requireActive(
        rows.find((row) => row.id === command.targetWorkId),
        'target work',
      );

      const counts = await session.unsafe<{ contentUnits: number; publications: number }[]>(
        'select (select count(*)::int from publications where work_id = $1) as publications, (select count(*)::int from content_units where work_id = $1) as "contentUnits"',
        [command.sourceWorkId],
      );
      const before = {
        contentUnits: counts[0]?.contentUnits ?? 0,
        sourceWorkId: command.sourceWorkId,
        sourceWorkTitle: source.title,
        targetWorkId: command.targetWorkId,
        targetWorkTitle: target.title,
      };

      await session.unsafe(
        'delete from work_aliases as source using work_aliases as target where source.work_id = $1 and target.work_id = $2 and source.kind = target.kind and source.value = target.value',
        [command.sourceWorkId, command.targetWorkId],
      );
      await session.unsafe(
        'delete from work_creators as source using work_creators as target where source.work_id = $1 and target.work_id = $2 and source.creator_id = target.creator_id and source.role = target.role',
        [command.sourceWorkId, command.targetWorkId],
      );
      await session.unsafe(
        'insert into library_entries as target (user_id, work_id, status, visibility, created_at, updated_at) select source.user_id, $2, source.status, source.visibility, source.created_at, source.updated_at from library_entries as source where source.work_id = $1 on conflict (user_id, work_id) do update set status = case when excluded.updated_at >= target.updated_at then excluded.status else target.status end, visibility = case when excluded.updated_at >= target.updated_at then excluded.visibility else target.visibility end, created_at = least(target.created_at, excluded.created_at), updated_at = greatest(target.updated_at, excluded.updated_at)',
        [command.sourceWorkId, command.targetWorkId],
      );
      await session.unsafe('delete from library_entries where work_id = $1', [
        command.sourceWorkId,
      ]);
      await session.unsafe(
        'insert into work_follow_settings as target (user_id, work_id, mode, updated_at) select source.user_id, $2, source.mode, source.updated_at from work_follow_settings as source where source.work_id = $1 on conflict (user_id, work_id) do update set mode = case when excluded.updated_at >= target.updated_at then excluded.mode else target.mode end, updated_at = greatest(target.updated_at, excluded.updated_at)',
        [command.sourceWorkId, command.targetWorkId],
      );
      await session.unsafe('delete from work_follow_settings where work_id = $1', [
        command.sourceWorkId,
      ]);
      await session.unsafe('update subscription_publications set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update user_volume_records set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update volume_content_mappings set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update volume_editions set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('delete from work_ingestion_keys where work_id = $1', [
        command.sourceWorkId,
      ]);
      await session.unsafe('update work_aliases set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update work_creators set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update publications set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update publication_entries set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update content_units set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe('update entry_content_mappings set work_id = $2 where work_id = $1', [
        command.sourceWorkId,
        command.targetWorkId,
      ]);
      await session.unsafe(
        'update works set retired_at = now(), updated_at = now() where id = $1',
        [command.sourceWorkId],
      );
      await this.#saveRedirect(session, 'work', command.sourceWorkId, command.targetWorkId);

      const record = auditRecord('merge_work', command.actor, command.reason, before, {
        canonicalWorkId: command.targetWorkId,
        retiredWorkId: command.sourceWorkId,
      });
      await this.#saveAudit(session, record);
      return record;
    });
  }

  async mergeContentUnits(
    context: TransactionContext,
    command: MergeContentUnitsCommand,
  ): Promise<CatalogAuditRecord> {
    return this.#foundation.withSession(context, async (session) => {
      await this.#deferCatalogConstraints(session);
      const rows = await session.unsafe<ContentUnitRow[]>(
        'select id::text, work_id::text as "workId", title, position, retired_at as "retiredAt" from content_units where id = any($1::uuid[]) for update',
        [[command.sourceContentUnitId, command.targetContentUnitId]],
      );
      const source = requireActive(
        rows.find((row) => row.id === command.sourceContentUnitId),
        'source content unit',
      );
      const target = requireActive(
        rows.find((row) => row.id === command.targetContentUnitId),
        'target content unit',
      );
      if (source.workId !== target.workId) {
        throw new Error('content units must belong to the same work');
      }

      const mappingCount = await session.unsafe<{ count: number }[]>(
        'select count(*)::int as count from entry_content_mappings where content_unit_id = $1',
        [source.id],
      );
      await session.unsafe(
        'insert into entry_content_mappings (work_id, publication_entry_id, content_unit_id, confirmed) select work_id, publication_entry_id, $2, confirmed from entry_content_mappings where content_unit_id = $1 on conflict (publication_entry_id, content_unit_id) do update set confirmed = entry_content_mappings.confirmed or excluded.confirmed',
        [source.id, target.id],
      );
      await session.unsafe(
        "insert into volume_content_mappings as target (volume_edition_id, content_unit_id, work_id, status, created_at, updated_at) select volume_edition_id, $2, work_id, status, created_at, updated_at from volume_content_mappings where content_unit_id = $1 on conflict (volume_edition_id, content_unit_id) do update set status = case when target.status = 'confirmed'::volume_content_mapping_status or excluded.status = 'confirmed'::volume_content_mapping_status then 'confirmed'::volume_content_mapping_status when target.status = 'unconfirmed'::volume_content_mapping_status or excluded.status = 'unconfirmed'::volume_content_mapping_status then 'unconfirmed'::volume_content_mapping_status else 'rejected'::volume_content_mapping_status end, updated_at = greatest(target.updated_at, excluded.updated_at)",
        [source.id, target.id],
      );
      await session.unsafe('delete from volume_content_mappings where content_unit_id = $1', [
        source.id,
      ]);
      await session.unsafe('delete from entry_content_mappings where content_unit_id = $1', [
        source.id,
      ]);
      await session.unsafe(
        'update content_units set retired_at = now(), updated_at = now() where id = $1',
        [source.id],
      );
      await this.#saveRedirect(session, 'content_unit', source.id, target.id);

      const record = auditRecord(
        'merge_content_unit',
        command.actor,
        command.reason,
        {
          mappingCount: mappingCount[0]?.count ?? 0,
          sourceContentUnitId: source.id,
          targetContentUnitId: target.id,
          workId: source.workId,
        },
        {
          canonicalContentUnitId: target.id,
          retiredContentUnitId: source.id,
        },
      );
      await this.#saveAudit(session, record);
      return record;
    });
  }

  async splitWork(
    context: TransactionContext,
    command: SplitWorkCommand,
  ): Promise<CatalogAuditRecord> {
    return this.#foundation.withSession(context, async (session) => {
      await this.#deferCatalogConstraints(session);
      const sourceRows = await session.unsafe<WorkRow[]>(
        'select id::text, title, retired_at as "retiredAt" from works where id = $1 for update',
        [command.sourceWorkId],
      );
      requireActive(sourceRows[0], 'source work');
      const publicationRows = await session.unsafe<{ id: string }[]>(
        'select id::text from publications where work_id = $1 and id = any($2::uuid[]) for update',
        [command.sourceWorkId, [...command.publicationIds]],
      );
      const contentRows = await session.unsafe<{ id: string }[]>(
        'select id::text from content_units where work_id = $1 and retired_at is null and id = any($2::uuid[]) for update',
        [command.sourceWorkId, [...command.contentUnitIds]],
      );
      if (publicationRows.length !== command.publicationIds.length) {
        throw new Error('selected publications must belong to the active source work');
      }
      if (contentRows.length !== command.contentUnitIds.length) {
        throw new Error('selected content units must belong to the active source work');
      }
      const entryRows = await session.unsafe<{ id: string }[]>(
        'select id::text from publication_entries where publication_id = any($1::uuid[])',
        [[...command.publicationIds]],
      );
      const entryIds = entryRows.map((entry) => entry.id);
      const boundaryRows = await session.unsafe<{ count: number }[]>(
        'select count(*)::int as count from entry_content_mappings where (publication_entry_id = any($1::uuid[]) and not (content_unit_id = any($2::uuid[]))) or (content_unit_id = any($2::uuid[]) and not (publication_entry_id = any($1::uuid[])))',
        [entryIds, [...command.contentUnitIds]],
      );
      if ((boundaryRows[0]?.count ?? 0) !== 0) {
        throw new Error(
          'split selection must include every connected entry and content unit mapping',
        );
      }

      const newWorkId = crypto.randomUUID();
      await session.unsafe(
        'insert into works (id, title, serial_status, retired_at) values ($1, $2, $3::serial_status, null)',
        [newWorkId, command.title.trim(), command.serialStatus],
      );
      await session.unsafe(
        'insert into work_creators (work_id, creator_id, role, position) select $2, creator_id, role, position from work_creators where work_id = $1',
        [command.sourceWorkId, newWorkId],
      );
      await session.unsafe('update publications set work_id = $2 where id = any($1::uuid[])', [
        [...command.publicationIds],
        newWorkId,
      ]);
      await session.unsafe(
        'update publication_entries set work_id = $2 where id = any($1::uuid[])',
        [entryIds, newWorkId],
      );
      await session.unsafe('update content_units set work_id = $2 where id = any($1::uuid[])', [
        [...command.contentUnitIds],
        newWorkId,
      ]);
      await session.unsafe(
        'update entry_content_mappings set work_id = $2 where publication_entry_id = any($1::uuid[])',
        [entryIds, newWorkId],
      );

      const record = auditRecord(
        'split_work',
        command.actor,
        command.reason,
        {
          contentUnitIds: [...command.contentUnitIds],
          publicationIds: [...command.publicationIds],
          sourceWorkId: command.sourceWorkId,
        },
        {
          newWorkId,
          title: command.title.trim(),
        },
      );
      await this.#saveAudit(session, record);
      return record;
    });
  }

  async splitContentUnit(
    context: TransactionContext,
    command: SplitContentUnitCommand,
  ): Promise<CatalogAuditRecord> {
    return this.#foundation.withSession(context, async (session) => {
      await this.#deferCatalogConstraints(session);
      const rows = await session.unsafe<ContentUnitRow[]>(
        'select id::text, work_id::text as "workId", title, position, retired_at as "retiredAt" from content_units where id = $1 for update',
        [command.sourceContentUnitId],
      );
      const source = requireActive(rows[0], 'source content unit');
      const mappings = await session.unsafe<{ id: string }[]>(
        'select publication_entry_id::text as id from entry_content_mappings where content_unit_id = $1 and publication_entry_id = any($2::uuid[]) for update',
        [source.id, [...command.entryIds]],
      );
      if (mappings.length !== command.entryIds.length) {
        throw new Error('selected entries must map to the source content unit');
      }

      const newContentUnitId = crypto.randomUUID();
      await session.unsafe(
        'insert into content_units (id, work_id, title, position, retired_at) values ($1, $2, $3, $4, null)',
        [newContentUnitId, source.workId, command.title.trim(), command.position],
      );
      await session.unsafe(
        'update entry_content_mappings set content_unit_id = $2 where content_unit_id = $1 and publication_entry_id = any($3::uuid[])',
        [source.id, newContentUnitId, [...command.entryIds]],
      );

      const record = auditRecord(
        'split_content_unit',
        command.actor,
        command.reason,
        {
          entryIds: [...command.entryIds],
          sourceContentUnitId: source.id,
          workId: source.workId,
        },
        {
          newContentUnitId,
          position: command.position,
          title: command.title.trim(),
        },
      );
      await this.#saveAudit(session, record);
      return record;
    });
  }

  async resolveReviewItem(
    context: TransactionContext,
    actor: CatalogAdminActor,
    itemId: string,
  ): Promise<CatalogReviewItem> {
    return this.#foundation.withSession(context, async (session) => {
      const rows = await session.unsafe<ReviewRow[]>(
        'update catalog_review_items set status = \'resolved\', resolved_at = now(), resolved_by = $2 where id = $1 and status = \'open\' returning id::text, kind, status, source_id::text as "sourceId", payload, created_at as "createdAt", resolved_at as "resolvedAt", resolved_by as "resolvedBy"',
        [itemId, actor.id],
      );
      const item = rows[0];
      if (!item) throw new Error('open review item was not found');
      return item;
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }

  async #deferCatalogConstraints(session: TransactionSql): Promise<void> {
    await session.unsafe(
      'set constraints publication_entries_publication_id_work_id_fkey, entry_content_mappings_publication_entry_id_work_id_fkey, entry_content_mappings_content_unit_id_work_id_fkey, subscription_publications_publication_id_work_id_fkey, volume_content_mappings_volume_edition_id_work_id_fkey, volume_content_mappings_content_unit_id_work_id_fkey, user_volume_records_volume_edition_id_work_id_fkey, user_volume_records_memo_content_unit_id_work_id_fkey deferred',
    );
  }

  async #saveAudit(session: TransactionSql, record: CatalogAuditRecord): Promise<void> {
    await session.unsafe(
      'insert into catalog_merge_audits (id, operation, operator_id, reason, before_data, after_data, created_at) values ($1, $2::catalog_audit_operation, $3, $4, $5::jsonb, $6::jsonb, $7)',
      [
        record.id,
        record.operation,
        record.operatorId,
        record.reason,
        JSON.stringify(record.before),
        JSON.stringify(record.after),
        record.createdAt,
      ],
    );
  }

  async #saveRedirect(
    session: TransactionSql,
    resource: CatalogRedirect['resource'],
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    await session.unsafe(
      'insert into catalog_redirects (resource, source_id, target_id, created_at) values ($1::catalog_redirect_resource, $2, $3, now()) on conflict (resource, source_id) do update set target_id = excluded.target_id, created_at = excluded.created_at',
      [resource, sourceId, targetId],
    );
  }
}

export const createPostgresCatalogAdmin = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresCatalogAdmin => new PostgresCatalogAdmin(databaseUrl, foundation);
