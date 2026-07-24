import type {
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

    const [aliasRows, creatorRows, contentUnitRows, publicationRows, entryRows, mappingRows] =
      await Promise.all([
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
            externalId: publications.externalId,
            id: publications.id,
            kind: publications.kind,
            normalizedUrl: publications.normalizedUrl,
            sourceId: publications.sourceId,
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
        entries: entriesByPublication.get(publication.id) ?? [],
        externalId: publication.externalId,
        id: publication.id,
        kind: publication.kind,
        normalizedUrl: publication.normalizedUrl,
        sourceId: publication.sourceId,
        sourceName: publication.sourceName,
        title: publication.title,
      })),
      serialStatus: work.serialStatus,
      title: work.title,
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

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresCatalog = (databaseUrl: string): PostgresCatalog => {
  return new PostgresCatalog(databaseUrl);
};
