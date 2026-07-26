import type {
  CatalogSearchQuery,
  CatalogQueryPort,
  CatalogRepository,
  PublicationEntryReadModel,
  WorkCatalogReadModel,
} from '@web-comic-library/application';
import type {
  ContentUnit,
  Creator,
  EntryContentMapping,
  Publication,
  PublicationEntry,
  Source,
  Work,
  WorkAlias,
  WorkCreator,
} from '@web-comic-library/domain';
import { isCatchUpEntryKind } from '@web-comic-library/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import {
  contentUnits,
  creators,
  entryContentMappings,
  publicationEntries,
  publications,
  sources,
  workAliases,
  workCreators,
  works,
} from './catalog-schema';

type WorkIdRow = Readonly<{ id: string }>;
type VolumeEditionRow = Readonly<{
  authors: readonly string[];
  id: string;
  publishedAt: string | null;
  publisher: string | null;
  title: string;
}>;

const escapeLike = (value: string): string => {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
};

export class PostgresCatalog implements CatalogRepository, CatalogQueryPort {
  readonly #client: Sql;
  readonly #database: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
    this.#database = drizzle(this.#client);
  }

  async createWork(work: Work): Promise<void> {
    await this.#database.insert(works).values(work);
  }

  async addWorkAlias(alias: WorkAlias): Promise<void> {
    await this.#database.insert(workAliases).values(alias);
  }

  async createCreator(creator: Creator): Promise<void> {
    await this.#database.insert(creators).values(creator);
  }

  async addWorkCreator(link: WorkCreator): Promise<void> {
    await this.#database.insert(workCreators).values(link);
  }

  async createSource(source: Source): Promise<void> {
    await this.#database.insert(sources).values(source);
  }

  async createPublication(publication: Publication): Promise<void> {
    await this.#database.insert(publications).values(publication);
  }

  async createContentUnit(contentUnit: ContentUnit): Promise<void> {
    await this.#database.insert(contentUnits).values(contentUnit);
  }

  async createPublicationEntry(entry: PublicationEntry): Promise<void> {
    await this.#database.insert(publicationEntries).values(entry);
  }

  async mapEntryToContent(mapping: EntryContentMapping): Promise<void> {
    await this.#database.insert(entryContentMappings).values(mapping);
  }

  async findWork(workId: string): Promise<WorkCatalogReadModel | null> {
    const workRows = await this.#database
      .select({
        id: works.id,
        serialStatus: works.serialStatus,
        title: works.title,
      })
      .from(works)
      .where(and(eq(works.id, workId), isNull(works.retiredAt)));
    const work = workRows[0];

    if (!work) {
      return null;
    }

    const [
      aliasRows,
      creatorRows,
      contentUnitRows,
      publicationRows,
      entryRows,
      mappingRows,
      volumeRows,
    ] = await Promise.all([
      this.#database
        .select({ value: workAliases.value })
        .from(workAliases)
        .where(eq(workAliases.workId, workId))
        .orderBy(asc(workAliases.value)),
      this.#database
        .select({
          id: creators.id,
          name: creators.name,
          position: workCreators.position,
          role: workCreators.role,
        })
        .from(workCreators)
        .innerJoin(creators, eq(creators.id, workCreators.creatorId))
        .where(eq(workCreators.workId, workId))
        .orderBy(asc(workCreators.position), asc(creators.id)),
      this.#database
        .select({
          id: contentUnits.id,
          position: contentUnits.position,
          title: contentUnits.title,
        })
        .from(contentUnits)
        .where(and(eq(contentUnits.workId, workId), isNull(contentUnits.retiredAt)))
        .orderBy(asc(contentUnits.position), asc(contentUnits.id)),
      this.#database
        .select({
          ageRatingValue: publications.ageRatingValue,
          externalId: publications.externalId,
          id: publications.id,
          kind: publications.kind,
          normalizedUrl: publications.normalizedUrl,
          purchaseUrl: publications.purchaseUrl,
          sourceId: publications.sourceId,
          sourceKey: sources.key,
          sourceName: sources.name,
          title: publications.title,
        })
        .from(publications)
        .innerJoin(sources, eq(sources.id, publications.sourceId))
        .where(and(eq(publications.workId, workId), isNull(publications.retiredAt)))
        .orderBy(asc(publications.title), asc(publications.id)),
      this.#database
        .select({
          externalId: publicationEntries.externalId,
          id: publicationEntries.id,
          kind: publicationEntries.kind,
          normalizedUrl: publicationEntries.normalizedUrl,
          position: publicationEntries.position,
          publicationId: publicationEntries.publicationId,
          publishedAt: publicationEntries.publishedAt,
          title: publicationEntries.title,
        })
        .from(publicationEntries)
        .where(and(eq(publicationEntries.workId, workId), isNull(publicationEntries.retiredAt)))
        .orderBy(asc(publicationEntries.position), asc(publicationEntries.id)),
      this.#database
        .select({
          confirmed: entryContentMappings.confirmed,
          contentUnitId: entryContentMappings.contentUnitId,
          publicationEntryId: entryContentMappings.publicationEntryId,
        })
        .from(entryContentMappings)
        .where(eq(entryContentMappings.workId, workId)),
      this.#client<VolumeEditionRow[]>`
          select id::text, title, authors, publisher, published_at::text as "publishedAt"
          from volume_editions
          where work_id = ${workId}::uuid
            and retired_at is null
            and publication_status = 'active'::volume_publication_status
          order by published_at nulls last, id
        `,
    ]);

    const entriesByPublication = new Map<string, PublicationEntryReadModel[]>();

    for (const entry of entryRows) {
      const readModel: PublicationEntryReadModel = {
        catchUpEligible: isCatchUpEntryKind(entry.kind),
        externalId: entry.externalId,
        id: entry.id,
        kind: entry.kind,
        mappings: mappingRows
          .filter((mapping) => mapping.publicationEntryId === entry.id)
          .map((mapping) => ({
            confirmed: mapping.confirmed,
            contentUnitId: mapping.contentUnitId,
          })),
        normalizedUrl: entry.normalizedUrl,
        position: entry.position,
        publishedAt: entry.publishedAt,
        title: entry.title,
      };
      const existing = entriesByPublication.get(entry.publicationId);

      if (existing) {
        existing.push(readModel);
      } else {
        entriesByPublication.set(entry.publicationId, [readModel]);
      }
    }

    return {
      aliases: aliasRows.map((alias) => alias.value),
      contentUnits: contentUnitRows,
      creators: creatorRows,
      id: work.id,
      publications: publicationRows.map((publication) => ({
        ageRatingValue: publication.ageRatingValue,
        entries: entriesByPublication.get(publication.id) ?? [],
        externalId: publication.externalId,
        id: publication.id,
        kind: publication.kind,
        normalizedUrl: publication.normalizedUrl,
        purchaseUrl: publication.purchaseUrl,
        sourceId: publication.sourceId,
        sourceKey: publication.sourceKey,
        sourceName: publication.sourceName,
        title: publication.title,
      })),
      serialStatus: work.serialStatus,
      title: work.title,
      volumes: volumeRows,
    };
  }

  async listCatchUpEntries(workId: string): Promise<readonly PublicationEntryReadModel[]> {
    const work = await this.findWork(workId);

    if (!work) {
      return [];
    }

    return work.publications.flatMap((publication) =>
      publication.entries.filter((entry) => entry.catchUpEligible),
    );
  }

  async searchWorkIds(query: CatalogSearchQuery): Promise<readonly string[]> {
    const normalizedQuery = (query.query ?? '').normalize('NFKC').toLocaleLowerCase('ja-JP');
    const escapedQuery = escapeLike(normalizedQuery);
    const rows = await this.#client.unsafe<WorkIdRow[]>(
      `
        with ranked_works as (
          select
            work.id::text as id,
            case
              when $1 = '' then 0
              when lower(normalize(work.title, NFKC)) = $1 then 0
              when lower(normalize(work.title, NFKC)) like $2 escape '\\' then 1
              when lower(normalize(work.title, NFKC)) like $3 escape '\\' then 2
              when exists (
                select 1 from work_aliases as alias
                where alias.work_id = work.id and lower(normalize(alias.value, NFKC)) = $1
              ) then 3
              when exists (
                select 1
                from work_creators as link
                join creators as creator on creator.id = link.creator_id
                where link.work_id = work.id and lower(normalize(creator.name, NFKC)) = $1
              ) then 4
              else 5
            end as match_rank,
            (
              select max(entry.published_at)
              from publication_entries as entry
              where entry.work_id = work.id and entry.retired_at is null
            ) as recent_at,
            (
              select count(*)
              from library_entries as library
              where library.work_id = work.id and library.created_at >= now() - interval '30 days'
            ) as popularity
            , work.created_at as created_at
          from works as work
          where work.retired_at is null
            and (
              $1 = ''
              or lower(normalize(work.title, NFKC)) like $3 escape '\\'
              or exists (
                select 1 from work_aliases as alias
                where alias.work_id = work.id and lower(normalize(alias.value, NFKC)) like $3 escape '\\'
              )
              or exists (
                select 1
                from work_creators as link
                join creators as creator on creator.id = link.creator_id
                where link.work_id = work.id and lower(normalize(creator.name, NFKC)) like $3 escape '\\'
              )
            )
            and (
              $4::text is null or exists (
                select 1 from publications as publication
                join sources as source on source.id = publication.source_id
                where publication.work_id = work.id and source.key = $4
              )
            )
            and (
              $5::publication_kind is null or exists (
                select 1 from publications as publication
                where publication.work_id = work.id and publication.kind = $5::publication_kind
              )
            )
            and ($6::serial_status is null or work.serial_status = $6::serial_status)
        )
        select id
        from ranked_works
        order by
          case when $7 = 'recent' then recent_at end desc nulls last,
          case when $7 = 'popular' then popularity end desc nulls last,
          case when $7 = 'new' then created_at end desc,
          match_rank asc,
          id asc
        limit 200
      `,
      [
        normalizedQuery,
        `${escapedQuery}%`,
        `%${escapedQuery}%`,
        query.sourceKey,
        query.kind,
        query.status,
        query.sort,
      ],
    );
    return rows.map((row) => row.id);
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresCatalog = (databaseUrl: string): PostgresCatalog => {
  return new PostgresCatalog(databaseUrl);
};
