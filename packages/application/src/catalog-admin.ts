import type { CatalogAdminActor, SerialStatus } from '@web-comic-library/domain';
import {
  requireCatalogAdmin,
  requireCatalogOperationReason,
  requireDistinctCatalogIds,
  requireUniqueCatalogIds,
} from '@web-comic-library/domain';

import type { JsonValue, TransactionContext, TransactionPort } from './persistence';

export const catalogReviewKinds = [
  'parse_failure',
  'unknown_publication_kind',
  'user_correction',
] as const;

export type CatalogReviewKind = (typeof catalogReviewKinds)[number];

export type CatalogReviewItem = Readonly<{
  createdAt: Date;
  id: string;
  kind: CatalogReviewKind;
  payload: JsonValue;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  sourceId: string | null;
  status: 'open' | 'resolved';
}>;

export type CatalogAuditRecord = Readonly<{
  after: JsonValue;
  before: JsonValue;
  createdAt: Date;
  id: string;
  operation: 'merge_content_unit' | 'merge_work' | 'split_content_unit' | 'split_work';
  operatorId: string;
  reason: string;
}>;

export type CatalogRedirect = Readonly<{
  canonicalId: string;
  resource: 'content_unit' | 'work';
}>;

export type MergeWorksCommand = Readonly<{
  actor: CatalogAdminActor;
  reason: string;
  sourceWorkId: string;
  targetWorkId: string;
}>;

export type MergeContentUnitsCommand = Readonly<{
  actor: CatalogAdminActor;
  reason: string;
  sourceContentUnitId: string;
  targetContentUnitId: string;
}>;

export type SplitWorkCommand = Readonly<{
  actor: CatalogAdminActor;
  contentUnitIds: readonly string[];
  publicationIds: readonly string[];
  reason: string;
  serialStatus: SerialStatus;
  sourceWorkId: string;
  title: string;
}>;

export type SplitContentUnitCommand = Readonly<{
  actor: CatalogAdminActor;
  entryIds: readonly string[];
  position: number;
  reason: string;
  sourceContentUnitId: string;
  title: string;
}>;

export interface CatalogAdminRepository {
  findAuditRecords(limit: number): Promise<readonly CatalogAuditRecord[]>;
  findRedirect(resource: CatalogRedirect['resource'], id: string): Promise<CatalogRedirect | null>;
  listReviewItems(): Promise<readonly CatalogReviewItem[]>;
  mergeContentUnits(
    context: TransactionContext,
    command: MergeContentUnitsCommand,
  ): Promise<CatalogAuditRecord>;
  mergeWorks(context: TransactionContext, command: MergeWorksCommand): Promise<CatalogAuditRecord>;
  resolveReviewItem(
    context: TransactionContext,
    actor: CatalogAdminActor,
    itemId: string,
  ): Promise<CatalogReviewItem>;
  splitContentUnit(
    context: TransactionContext,
    command: SplitContentUnitCommand,
  ): Promise<CatalogAuditRecord>;
  splitWork(context: TransactionContext, command: SplitWorkCommand): Promise<CatalogAuditRecord>;
}

const validateMergeWorks = (command: MergeWorksCommand): MergeWorksCommand => {
  requireCatalogAdmin(command.actor);
  requireCatalogOperationReason(command.reason);
  requireDistinctCatalogIds(command.sourceWorkId, command.targetWorkId, 'work');
  return command;
};

const validateMergeContentUnits = (command: MergeContentUnitsCommand): MergeContentUnitsCommand => {
  requireCatalogAdmin(command.actor);
  requireCatalogOperationReason(command.reason);
  requireDistinctCatalogIds(
    command.sourceContentUnitId,
    command.targetContentUnitId,
    'content unit',
  );
  return command;
};

const validateSplitWork = (command: SplitWorkCommand): SplitWorkCommand => {
  requireCatalogAdmin(command.actor);
  requireCatalogOperationReason(command.reason);
  requireUniqueCatalogIds(command.publicationIds, 'publication ids');
  requireUniqueCatalogIds(command.contentUnitIds, 'content unit ids');
  if (!command.title.trim()) throw new Error('title must not be empty');
  return command;
};

const validateSplitContentUnit = (command: SplitContentUnitCommand): SplitContentUnitCommand => {
  requireCatalogAdmin(command.actor);
  requireCatalogOperationReason(command.reason);
  requireUniqueCatalogIds(command.entryIds, 'entry ids');
  if (!command.title.trim()) throw new Error('title must not be empty');
  if (!Number.isSafeInteger(command.position) || command.position < 0) {
    throw new Error('position must be a non-negative safe integer');
  }
  return command;
};

export const mergeWorks = async (
  transactions: TransactionPort,
  repository: CatalogAdminRepository,
  command: MergeWorksCommand,
): Promise<CatalogAuditRecord> => {
  return transactions.transaction((context) =>
    repository.mergeWorks(context, validateMergeWorks(command)),
  );
};

export const mergeContentUnits = async (
  transactions: TransactionPort,
  repository: CatalogAdminRepository,
  command: MergeContentUnitsCommand,
): Promise<CatalogAuditRecord> => {
  return transactions.transaction((context) =>
    repository.mergeContentUnits(context, validateMergeContentUnits(command)),
  );
};

export const splitWork = async (
  transactions: TransactionPort,
  repository: CatalogAdminRepository,
  command: SplitWorkCommand,
): Promise<CatalogAuditRecord> => {
  return transactions.transaction((context) =>
    repository.splitWork(context, validateSplitWork(command)),
  );
};

export const splitContentUnit = async (
  transactions: TransactionPort,
  repository: CatalogAdminRepository,
  command: SplitContentUnitCommand,
): Promise<CatalogAuditRecord> => {
  return transactions.transaction((context) =>
    repository.splitContentUnit(context, validateSplitContentUnit(command)),
  );
};

export const resolveCatalogReviewItem = async (
  transactions: TransactionPort,
  repository: CatalogAdminRepository,
  actor: CatalogAdminActor,
  itemId: string,
): Promise<CatalogReviewItem> => {
  requireCatalogAdmin(actor);
  if (!itemId.trim()) throw new Error('review item id must not be empty');
  return transactions.transaction((context) =>
    repository.resolveReviewItem(context, actor, itemId),
  );
};
