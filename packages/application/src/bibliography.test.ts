import { expect, test } from 'bun:test';

import type { BibliographyProviderRecord } from '@web-comic-library/domain';

import {
  type BibliographyProviderPort,
  type BibliographyRepository,
  registerPublisherProductVolume,
  synchronizeVolume,
} from './bibliography';
import { TransactionContext, type TransactionPort } from './persistence';

const transactionPort: TransactionPort = {
  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    return operation(new TransactionContext());
  },
};

const record = (
  provider: 'ndl' | 'openbd',
  fields: Pick<BibliographyProviderRecord, 'authors' | 'publishedAt' | 'publisher' | 'title'>,
): BibliographyProviderRecord => ({
  ...fields,
  cover: null,
  fetchedAt: new Date('2026-07-27T00:00:00Z'),
  found: true,
  isbn: '9784101001548',
  provider,
  sourceUrl: `https://${provider}.example/9784101001548`,
  termsUrl: `https://${provider}.example/terms`,
});

test('synchronizes both providers outside the transaction and keeps openBD field priority', async () => {
  const calls: string[] = [];
  const openBd: BibliographyProviderPort = {
    async lookup(isbn: string): Promise<BibliographyProviderRecord> {
      calls.push(`openbd:${isbn}`);
      return record('openbd', {
        authors: null,
        publishedAt: null,
        publisher: 'openBD出版',
        title: 'openBD題名',
      });
    },
  };
  const ndl: BibliographyProviderPort = {
    async lookup(isbn: string): Promise<BibliographyProviderRecord> {
      calls.push(`ndl:${isbn}`);
      return record('ndl', {
        authors: ['NDL著者'],
        publishedAt: '2026-07-01',
        publisher: 'NDL出版',
        title: 'NDL題名',
      });
    },
  };
  const repository: BibliographyRepository = {
    async coverageForIsbns() {
      return { identifiers: 0, ndlFound: 0, openBdFound: 0 };
    },
    async savePublisherProductVolume() {
      throw new Error('not used');
    },
    async saveVolumeContentMapping() {},
    async saveSynchronization(_context, input) {
      if (!input.resolved) throw new Error('resolved bibliography is required for this test');
      expect(input.resolved.title.value).toBe('openBD題名');
      expect(input.resolved.authors.value).toEqual(['NDL著者']);
      return {
        created: true,
        notificationSuppressed: true,
        releaseEventCreated: false,
        volumeEditionId: 'volume-1',
        withdrawn: false,
      };
    },
  };

  await expect(
    synchronizeVolume(transactionPort, repository, openBd, ndl, {
      isbn: '4-10-100154-5',
      mode: 'initial',
      occurredAt: new Date('2026-07-27T00:00:00Z'),
      workId: 'work-1',
    }),
  ).resolves.toMatchObject({ notificationSuppressed: true, volumeEditionId: 'volume-1' });
  expect(calls).toEqual(['openbd:9784101001548', 'ndl:9784101001548']);
});

test('registers a publisher product edition through the repository port', async () => {
  const repository: BibliographyRepository = {
    async coverageForIsbns() {
      return { identifiers: 0, ndlFound: 0, openBdFound: 0 };
    },
    async savePublisherProductVolume(_context, input) {
      expect(input.publisherProductId).toBe('publisher-product-1');
      return {
        created: true,
        notificationSuppressed: false,
        releaseEventCreated: true,
        volumeEditionId: 'volume-publisher-1',
        withdrawn: false,
      };
    },
    async saveSynchronization() {
      throw new Error('not used');
    },
    async saveVolumeContentMapping() {},
  };

  await expect(
    registerPublisherProductVolume(transactionPort, repository, {
      authors: ['出版社著者'],
      coverLicenseUrl: null,
      coverUrl: null,
      fetchedAt: new Date('2026-07-27T00:00:00Z'),
      mode: 'incremental',
      occurredAt: new Date('2026-07-27T00:00:00Z'),
      publishedAt: '2026-07-01',
      publisher: '出版社',
      publisherProductId: 'publisher-product-1',
      sourceUrl: 'https://publisher.example/products/1',
      termsUrl: 'https://publisher.example/terms',
      title: '出版社商品',
      workId: 'work-1',
    }),
  ).resolves.toMatchObject({ volumeEditionId: 'volume-publisher-1' });
});
