import type {
  ContentUnit,
  Creator,
  EntryContentMapping,
  Publication,
  PublicationEntry,
  PublicationEntryKind,
  PublicationKind,
  SerialStatus,
  Source,
  Work,
  WorkAlias,
  WorkCreator,
} from '@web-comic-library/domain';

export interface CatalogRepository {
  addWorkAlias(alias: WorkAlias): Promise<void>;
  addWorkCreator(link: WorkCreator): Promise<void>;
  createContentUnit(contentUnit: ContentUnit): Promise<void>;
  createCreator(creator: Creator): Promise<void>;
  createPublication(publication: Publication): Promise<void>;
  createPublicationEntry(entry: PublicationEntry): Promise<void>;
  createSource(source: Source): Promise<void>;
  createWork(work: Work): Promise<void>;
  mapEntryToContent(mapping: EntryContentMapping): Promise<void>;
}

export type CatalogCreatorReadModel = Readonly<{
  id: string;
  name: string;
  position: number;
  role: string;
}>;

export type ContentUnitReadModel = Readonly<{
  id: string;
  position: number;
  title: string;
}>;

export type EntryContentMappingReadModel = Readonly<{
  confirmed: boolean;
  contentUnitId: string;
}>;

export type PublicationEntryReadModel = Readonly<{
  catchUpEligible: boolean;
  externalId: string | null;
  id: string;
  kind: PublicationEntryKind;
  mappings: readonly EntryContentMappingReadModel[];
  normalizedUrl: string;
  position: number;
  publishedAt: Date | null;
  title: string;
}>;

export type PublicationReadModel = Readonly<{
  ageRatingValue: string | null;
  entries: readonly PublicationEntryReadModel[];
  externalId: string | null;
  id: string;
  kind: PublicationKind;
  normalizedUrl: string;
  purchaseUrl: string | null;
  sourceId: string;
  sourceName: string;
  title: string;
}>;

export type WorkCatalogReadModel = Readonly<{
  aliases: readonly string[];
  contentUnits: readonly ContentUnitReadModel[];
  creators: readonly CatalogCreatorReadModel[];
  id: string;
  publications: readonly PublicationReadModel[];
  serialStatus: SerialStatus;
  title: string;
}>;

export interface CatalogQueryPort {
  findWork(workId: string): Promise<WorkCatalogReadModel | null>;
  listCatchUpEntries(workId: string): Promise<readonly PublicationEntryReadModel[]>;
}
