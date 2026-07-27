import type {
  FavoriteImportInput,
  FavoriteImportRepository,
  TransactionContext,
} from '@web-comic-library/application';
import type { FavoriteImportBatch, FavoriteImportCandidate } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type CandidateRow = Readonly<{
  alternativeWorkIds: unknown;
  batchId: string;
  canonicalUrl: string;
  externalWorkId: string | null;
  id: string;
  matchKind: FavoriteImportCandidate['matchKind'];
  matchedPublicationId: string | null;
  matchedWorkId: string | null;
  sourceId: string;
  title: string;
  titleMatchWorkIds: unknown;
}>;

const stringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];

export class PostgresFavoriteImport implements FavoriteImportRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async claimBatch(
    context: TransactionContext,
    batchId: string,
    now: Date,
    userUuid: string,
  ): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) => session<{ id: string }[]>`
        update favorite_import_batches
        set confirmed_at = ${now}
        where id = ${batchId}::uuid and user_id = ${userUuid}
          and confirmed_at is null and discarded_at is null and expires_at > ${now}
        returning id::text
      `,
    );
    return rows.length === 1;
  }

  async createBatch(context: TransactionContext, batch: FavoriteImportBatch): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) => session`
        insert into favorite_import_batches (id, user_id, expires_at, created_at)
        values (${batch.id}::uuid, ${batch.userUuid}, ${batch.expiresAt}, ${batch.createdAt})
      `,
    );
  }

  async createCandidates(
    context: TransactionContext,
    batchId: string,
    candidates: readonly FavoriteImportInput[],
  ): Promise<void> {
    await this.#foundation.withSession(context, async (session) => {
      await Promise.all(
        candidates.map(async (candidate) => {
          const exact = await session<{ publicationId: string; workId: string }[]>`
          select publications.id::text as "publicationId", publications.work_id::text as "workId"
          from publications
          join works on works.id = publications.work_id
          where publications.source_id = ${candidate.sourceId}::uuid
            and publications.retired_at is null and works.retired_at is null
            and (
              publications.normalized_url = ${candidate.canonicalUrl}
              or (${candidate.externalWorkId}::text is not null
                and publications.external_id = ${candidate.externalWorkId})
            )
          order by publications.id
        `;
          const workIds = [...new Set(exact.map((row) => row.workId))];
          const titleMatches = await session<{ workId: string }[]>`
          select id::text as "workId" from works
          where title = ${candidate.title} and retired_at is null
          order by id
        `;
          const exactMatch =
            workIds.length === 1 ? exact.find((row) => row.workId === workIds[0]) : null;
          const matchKind: FavoriteImportCandidate['matchKind'] = exactMatch
            ? 'exact'
            : workIds.length > 1
              ? 'ambiguous'
              : 'unmatched';
          await session`
          insert into favorite_import_candidates (
            id, batch_id, source_id, external_work_id, canonical_url, title, match_kind,
            matched_work_id, matched_publication_id, alternative_work_ids, title_match_work_ids
          ) values (
            ${crypto.randomUUID()}::uuid, ${batchId}::uuid, ${candidate.sourceId}::uuid,
            ${candidate.externalWorkId}, ${candidate.canonicalUrl}, ${candidate.title}, ${matchKind},
            ${exactMatch?.workId ?? null}::uuid, ${exactMatch?.publicationId ?? null}::uuid,
            ${session.json(workIds)}::jsonb,
            ${session.json(titleMatches.map((row) => row.workId))}::jsonb
          )
        `;
        }),
      );
    });
  }

  async discardBatch(
    context: TransactionContext,
    batchId: string,
    now: Date,
    userUuid: string,
  ): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) => session<{ id: string }[]>`
        update favorite_import_batches
        set discarded_at = ${now}
        where id = ${batchId}::uuid and user_id = ${userUuid}
          and confirmed_at is null and discarded_at is null
        returning id::text
      `,
    );
    return rows.length === 1;
  }

  async findBatch(batchId: string, userUuid: string): Promise<FavoriteImportBatch | null> {
    const rows = await this.#client<FavoriteImportBatch[]>`
      select id::text, user_id as "userUuid", expires_at as "expiresAt",
        confirmed_at as "confirmedAt", discarded_at as "discardedAt", created_at as "createdAt"
      from favorite_import_batches where id = ${batchId}::uuid and user_id = ${userUuid}
    `;
    return rows[0] ?? null;
  }

  async listCandidates(batchId: string): Promise<readonly FavoriteImportCandidate[]> {
    const rows = await this.#client<CandidateRow[]>`
      select id::text, batch_id::text as "batchId", source_id::text as "sourceId",
        external_work_id as "externalWorkId", canonical_url as "canonicalUrl", title,
        match_kind as "matchKind", matched_work_id::text as "matchedWorkId",
        matched_publication_id::text as "matchedPublicationId",
        alternative_work_ids as "alternativeWorkIds", title_match_work_ids as "titleMatchWorkIds"
      from favorite_import_candidates where batch_id = ${batchId}::uuid order by id
    `;
    return rows.map((row) => ({
      alternativeWorkIds: stringArray(row.alternativeWorkIds),
      batchId: row.batchId,
      canonicalUrl: row.canonicalUrl,
      externalWorkId: row.externalWorkId,
      id: row.id,
      matchKind: row.matchKind,
      matchedPublicationId: row.matchedPublicationId,
      matchedWorkId: row.matchedWorkId,
      sourceId: row.sourceId,
      title: row.title,
      titleMatchWorkIds: stringArray(row.titleMatchWorkIds),
    }));
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresFavoriteImport = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresFavoriteImport => new PostgresFavoriteImport(databaseUrl, foundation);
