import type {
  BibliographyProviderRecord,
  ResolvedBibliography,
  VolumeContentMapping,
} from '@web-comic-library/domain';
import {
  createVolumeIdentifier,
  createVolumeContentMapping,
  resolveBibliography,
} from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export const bibliographySyncModes = ['initial', 'incremental'] as const;

export type BibliographySyncMode = (typeof bibliographySyncModes)[number];

export interface BibliographyProviderPort {
  lookup(isbn: string): Promise<BibliographyProviderRecord>;
}

export type SynchronizeVolumeCommand = Readonly<{
  isbn: string;
  mode: BibliographySyncMode;
  occurredAt: Date;
  workId: string;
}>;

export type VolumeSynchronization = Readonly<{
  mode: BibliographySyncMode;
  occurredAt: Date;
  providers: readonly BibliographyProviderRecord[];
  resolved: ResolvedBibliography | null;
  workId: string;
}>;

export type SynchronizeVolumeResult = Readonly<{
  created: boolean;
  notificationSuppressed: boolean;
  releaseEventCreated: boolean;
  volumeEditionId: string;
  withdrawn: boolean;
}>;

export type RegisterPublisherProductVolumeCommand = Readonly<{
  authors: readonly string[];
  coverLicenseUrl: string | null;
  coverUrl: string | null;
  fetchedAt: Date;
  mode: BibliographySyncMode;
  occurredAt: Date;
  publishedAt: string | null;
  publisher: string | null;
  publisherProductId: string;
  sourceUrl: string;
  termsUrl: string;
  title: string;
  workId: string;
}>;

export type PublisherProductVolumeSynchronization = RegisterPublisherProductVolumeCommand;

export type BibliographyCoverageReport = Readonly<{
  identifiers: number;
  ndlFound: number;
  openBdFound: number;
}>;

export interface BibliographyRepository {
  coverageForIsbns(isbns: readonly string[]): Promise<BibliographyCoverageReport>;
  saveVolumeContentMapping(
    context: TransactionContext,
    mapping: VolumeContentMapping,
  ): Promise<void>;
  saveSynchronization(
    context: TransactionContext,
    synchronization: VolumeSynchronization,
  ): Promise<SynchronizeVolumeResult>;
  savePublisherProductVolume(
    context: TransactionContext,
    synchronization: PublisherProductVolumeSynchronization,
  ): Promise<SynchronizeVolumeResult>;
}

export const saveVolumeContentMapping = async (
  transactions: TransactionPort,
  repository: BibliographyRepository,
  mapping: VolumeContentMapping,
): Promise<void> => {
  return transactions.transaction((context) =>
    repository.saveVolumeContentMapping(context, createVolumeContentMapping(mapping)),
  );
};

export const synchronizeVolume = async (
  transactions: TransactionPort,
  repository: BibliographyRepository,
  openBd: BibliographyProviderPort,
  ndl: BibliographyProviderPort,
  command: SynchronizeVolumeCommand,
): Promise<SynchronizeVolumeResult> => {
  const identifier = createVolumeIdentifier({ isbn: command.isbn, kind: 'isbn' });
  if (identifier.kind !== 'isbn') throw new Error('volume synchronization requires an ISBN');

  const [openBdRecord, ndlRecord] = await Promise.all([
    openBd.lookup(identifier.isbn),
    ndl.lookup(identifier.isbn),
  ]);
  if (openBdRecord.provider !== 'openbd' || ndlRecord.provider !== 'ndl') {
    throw new Error('bibliography providers returned records with an unexpected provider');
  }
  if (openBdRecord.isbn !== identifier.isbn || ndlRecord.isbn !== identifier.isbn) {
    throw new Error('bibliography provider record ISBN does not match the command');
  }

  const synchronization: VolumeSynchronization = {
    mode: command.mode,
    occurredAt: command.occurredAt,
    providers: [openBdRecord, ndlRecord],
    resolved:
      openBdRecord.found || ndlRecord.found ? resolveBibliography([openBdRecord, ndlRecord]) : null,
    workId: command.workId,
  };
  return transactions.transaction((context) =>
    repository.saveSynchronization(context, synchronization),
  );
};

export const registerPublisherProductVolume = async (
  transactions: TransactionPort,
  repository: BibliographyRepository,
  command: RegisterPublisherProductVolumeCommand,
): Promise<SynchronizeVolumeResult> => {
  const identifier = createVolumeIdentifier({
    kind: 'publisher_product',
    publisherProductId: command.publisherProductId,
  });
  if (identifier.kind !== 'publisher_product') {
    throw new Error('publisher product registration requires a publisher product ID');
  }
  if ((command.coverUrl === null) !== (command.coverLicenseUrl === null)) {
    throw new Error('publisher cover URL and license URL must be provided together');
  }
  if (!command.sourceUrl.startsWith('https://') || !command.termsUrl.startsWith('https://')) {
    throw new Error('publisher source and terms URLs must use HTTPS');
  }

  return transactions.transaction((context) =>
    repository.savePublisherProductVolume(context, {
      ...command,
      publisherProductId: identifier.publisherProductId,
    }),
  );
};
