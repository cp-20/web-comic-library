import type { FollowMode } from './follow';
import type { ReadingStatus } from './library';

export const favoriteImportMatchKinds = ['exact', 'ambiguous', 'unmatched'] as const;

export type FavoriteImportMatchKind = (typeof favoriteImportMatchKinds)[number];

export type FavoriteImportBatch = Readonly<{
  confirmedAt: Date | null;
  createdAt: Date;
  discardedAt: Date | null;
  expiresAt: Date;
  id: string;
  userUuid: string;
}>;

export type FavoriteImportCandidate = Readonly<{
  alternativeWorkIds: readonly string[];
  batchId: string;
  canonicalUrl: string;
  externalWorkId: string | null;
  id: string;
  matchKind: FavoriteImportMatchKind;
  matchedPublicationId: string | null;
  matchedWorkId: string | null;
  sourceId: string;
  title: string;
  titleMatchWorkIds: readonly string[];
}>;

export type FavoriteImportSettings = Readonly<{
  followMode: FollowMode;
  readingStatus: ReadingStatus | null;
}>;
