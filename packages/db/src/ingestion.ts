import type {
  IngestionCandidateSink,
  IngestionMode,
  IngestionResult,
  PublicationCandidate,
  TransactionContext,
} from '@web-comic-library/application';
import {
  canAutomaticallyMapEntries,
  normalizeAuthorNames,
  normalizeComparableText,
  parseEpisodeIdentity,
  releaseEventKindForEntry,
  type PublicationEntryKind,
} from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type PublicationRow = Readonly<{ id: string; workId: string }>;
type EntryRow = Readonly<{
  contentUnitId: string | null;
  id: string;
  kind: PublicationEntryKind;
  publishedAt: Date | null;
  title: string;
}>;

export class PostgresIngestion implements IngestionCandidateSink {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  // oxlint-disable no-await-in-loop -- Candidate writes share a transaction and must stop at the first failure.
  async saveCandidates(
    context: TransactionContext,
    sourceId: string,
    candidates: readonly PublicationCandidate[],
    mode: IngestionMode,
  ): Promise<IngestionResult> {
    return this.#foundation.withSession(context, async (session) => {
      let insertedCandidates = 0;
      let releaseEventCount = 0;

      for (const candidate of candidates) {
        const result = await this.#saveCandidate(session, sourceId, candidate, mode);
        insertedCandidates += result.insertedCandidate ? 1 : 0;
        releaseEventCount += result.releaseEventCount;
      }

      return { insertedCandidates, releaseEventCount };
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }

  // oxlint-enable no-await-in-loop

  async #saveCandidate(
    session: TransactionSql,
    sourceId: string,
    candidate: PublicationCandidate,
    mode: IngestionMode,
  ): Promise<Readonly<{ insertedCandidate: boolean; releaseEventCount: number }>> {
    if (candidate.kind === 'unknown') {
      const identity = candidate.externalId ?? candidate.url;
      await session.unsafe(
        'insert into catalog_review_items (id, kind, status, source_id, dedupe_key, payload, created_at, resolved_at, resolved_by) values ($1, $2::catalog_review_kind, $3::catalog_review_status, $4, $5, $6::jsonb, now(), null, null) on conflict (dedupe_key) do nothing',
        [
          crypto.randomUUID(),
          'unknown_publication_kind',
          'open',
          sourceId,
          `unknown-publication-kind:${sourceId}:${identity}`,
          JSON.stringify({
            externalId: candidate.externalId,
            title: candidate.title,
            url: candidate.url,
          }),
        ],
      );
    }
    const publications = await session.unsafe<PublicationRow[]>(
      'select id::text, work_id::text as "workId" from publications where source_id = $1 and (normalized_url = $2 or external_id = $3) for update',
      [sourceId, candidate.url, candidate.externalId],
    );
    const publication = publications[0];

    if (publications.length > 1) throw new Error('publication identity is ambiguous');

    if (publication) {
      await session.unsafe(
        'update publications set age_rating_value = $2, title = $3, kind = $4::publication_kind, updated_at = now() where id = $1',
        [publication.id, candidate.ageRatingValue, candidate.title, candidate.kind],
      );
      return this.#saveEntries(session, sourceId, publication, candidate, mode, false);
    }

    const workId = await this.#findOrCreateWork(session, candidate);
    const publicationId = crypto.randomUUID();
    await session.unsafe(
      'insert into publications (id, work_id, source_id, external_id, normalized_url, title, kind, age_rating_value, purchase_url, retired_at) values ($1, $2, $3, $4, $5, $6, $7::publication_kind, $8, null, null)',
      [
        publicationId,
        workId,
        sourceId,
        candidate.externalId,
        candidate.url,
        candidate.title,
        candidate.kind,
        candidate.ageRatingValue,
      ],
    );

    return this.#saveEntries(
      session,
      sourceId,
      { id: publicationId, workId },
      candidate,
      mode,
      true,
    );
  }

  // oxlint-disable no-await-in-loop -- Creator positions preserve the ordered connector metadata.
  async #findOrCreateWork(
    session: TransactionSql,
    candidate: PublicationCandidate,
  ): Promise<string> {
    const normalizedTitle = normalizeComparableText(candidate.title);
    const normalizedAuthors = normalizeAuthorNames(candidate.authors);
    const matches = await session.unsafe<{ workId: string }[]>(
      'select work_id::text as "workId" from work_ingestion_keys where normalized_title = $1 and normalized_authors = $2 and publication_kind = $3::publication_kind for update',
      [normalizedTitle, normalizedAuthors, candidate.kind],
    );
    const existing = matches[0];

    if (matches.length > 1) throw new Error('work identity is ambiguous');
    if (existing) return existing.workId;

    const workId = crypto.randomUUID();
    await session.unsafe(
      'insert into works (id, title, serial_status, retired_at) values ($1, $2, $3::serial_status, null)',
      [workId, candidate.title, 'unknown'],
    );
    await session.unsafe(
      'insert into work_ingestion_keys (work_id, normalized_title, normalized_authors, publication_kind) values ($1, $2, $3, $4::publication_kind)',
      [workId, normalizedTitle, normalizedAuthors, candidate.kind],
    );

    for (const [position, author] of candidate.authors.entries()) {
      const creatorId = crypto.randomUUID();
      await session.unsafe('insert into creators (id, name) values ($1, $2)', [creatorId, author]);
      await session.unsafe(
        'insert into work_creators (work_id, creator_id, role, position) values ($1, $2, $3, $4)',
        [workId, creatorId, 'unknown', position],
      );
    }

    return workId;
  }

  // oxlint-enable no-await-in-loop

  // oxlint-disable no-await-in-loop -- Entry persistence and content matching depend on earlier writes.
  async #saveEntries(
    session: TransactionSql,
    sourceId: string,
    publication: PublicationRow,
    candidate: PublicationCandidate,
    mode: IngestionMode,
    insertedCandidate: boolean,
  ): Promise<Readonly<{ insertedCandidate: boolean; releaseEventCount: number }>> {
    let releaseEventCount = 0;

    for (const [position, entry] of candidate.entries.entries()) {
      const rows = await session.unsafe<EntryRow[]>(
        'select id::text, kind, published_at as "publishedAt", title, null::text as "contentUnitId" from publication_entries where publication_id = $1 and (normalized_url = $2 or external_id = $3) for update',
        [publication.id, entry.url, entry.externalId],
      );
      if (rows.length > 1) throw new Error('publication entry identity is ambiguous');
      const existing = rows[0];
      const entryId = existing?.id ?? crypto.randomUUID();
      const availabilityChanged =
        existing !== undefined && existing.publishedAt?.getTime() !== entry.publishedAt?.getTime();

      if (existing) {
        await session.unsafe(
          'update publication_entries set kind = $2::publication_entry_kind, published_at = $3, title = $4, updated_at = now() where id = $1',
          [entryId, entry.kind, entry.publishedAt, entry.title],
        );
      } else {
        await session.unsafe(
          'insert into publication_entries (id, work_id, publication_id, external_id, normalized_url, title, kind, position, published_at, retired_at) values ($1, $2, $3, $4, $5, $6, $7::publication_entry_kind, $8, $9, null)',
          [
            entryId,
            publication.workId,
            publication.id,
            entry.externalId,
            entry.url,
            entry.title,
            entry.kind,
            position,
            entry.publishedAt,
          ],
        );
        await this.#ensureContentMapping(
          session,
          publication.workId,
          entryId,
          entry.title,
          entry.kind,
          position,
        );
      }

      const kind = availabilityChanged
        ? 'availability_changed'
        : existing
          ? null
          : releaseEventKindForEntry(entry.kind, entry.title);
      if (!kind) continue;

      const occurredAt = entry.publishedAt ?? candidate.updatedAt ?? new Date();
      const idempotencyKey =
        'release:' + sourceId + ':' + entryId + ':' + kind + ':' + occurredAt.toISOString();
      const inserted = await session.unsafe<{ id: string }[]>(
        'insert into release_events (id, idempotency_key, source_id, publication_entry_id, kind, occurred_at, notification_suppressed) values ($1, $2, $3, $4, $5::release_event_kind, $6, $7) on conflict (idempotency_key) do nothing returning id::text',
        [
          crypto.randomUUID(),
          idempotencyKey,
          sourceId,
          entryId,
          kind,
          occurredAt,
          mode === 'initial' || mode === 'backfill',
        ],
      );
      releaseEventCount += inserted.length;
    }

    return { insertedCandidate, releaseEventCount };
  }

  // oxlint-enable no-await-in-loop

  async #ensureContentMapping(
    session: TransactionSql,
    workId: string,
    entryId: string,
    title: string,
    kind: PublicationEntryKind,
    position: number,
  ): Promise<void> {
    const existing = await session.unsafe<EntryRow[]>(
      'select entry.id::text, entry.kind, entry.published_at as "publishedAt", entry.title, mapping.content_unit_id::text as "contentUnitId" from publication_entries as entry left join entry_content_mappings as mapping on mapping.publication_entry_id = entry.id where entry.work_id = $1 and entry.id <> $2',
      [workId, entryId],
    );
    const matches = existing.filter(
      (entry) =>
        entry.contentUnitId !== null &&
        canAutomaticallyMapEntries({ kind, title }, { kind: entry.kind, title: entry.title }),
    );

    if (matches.length === 1) {
      const match = matches[0];
      if (!match?.contentUnitId) throw new Error('matched content unit is missing');
      await session.unsafe(
        'insert into entry_content_mappings (work_id, publication_entry_id, content_unit_id, confirmed) values ($1, $2, $3, true)',
        [workId, entryId, match.contentUnitId],
      );
      return;
    }

    const contentUnitId = crypto.randomUUID();
    await session.unsafe(
      'insert into content_units (id, work_id, title, position, retired_at) values ($1, $2, $3, $4, null)',
      [contentUnitId, workId, title, parseEpisodeIdentity(title)?.number ?? position],
    );
    await session.unsafe(
      'insert into entry_content_mappings (work_id, publication_entry_id, content_unit_id, confirmed) values ($1, $2, $3, true)',
      [workId, entryId, contentUnitId],
    );
  }
}

export const createPostgresIngestion = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresIngestion => new PostgresIngestion(databaseUrl, foundation);
