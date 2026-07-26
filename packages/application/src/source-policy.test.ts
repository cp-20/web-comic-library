import { expect, test } from 'bun:test';

import type { CatalogQueryPort } from './catalog';
import type { SourcePolicyQueryPort } from './source-policy';
import { searchPublicWorks } from './source-policy';

test('searchPublicWorks keeps rejected publications out of combined filters', async () => {
  const catalog: CatalogQueryPort = {
    async findWork() {
      return {
        aliases: [],
        contentUnits: [],
        creators: [],
        id: 'work-1',
        publications: [
          {
            ageRatingValue: 'all',
            entries: [],
            externalId: null,
            id: 'official-public',
            kind: 'official',
            normalizedUrl: 'https://catalog.example/public',
            purchaseUrl: null,
            sourceId: 'source-1',
            sourceKey: 'catalog',
            sourceName: 'Catalog',
            title: '公開掲載',
          },
          {
            ageRatingValue: 'r18',
            entries: [],
            externalId: null,
            id: 'official-excluded',
            kind: 'official',
            normalizedUrl: 'https://catalog.example/excluded',
            purchaseUrl: null,
            sourceId: 'source-1',
            sourceKey: 'catalog',
            sourceName: 'Catalog',
            title: '除外掲載',
          },
        ],
        serialStatus: 'ongoing',
        title: '作品',
        volumes: [],
      };
    },
    async listCatchUpEntries() {
      return [];
    },
    async searchWorkIds() {
      return ['work-1'];
    },
  };
  const policies: Pick<SourcePolicyQueryPort, 'listPublicPublicationIds'> = {
    async listPublicPublicationIds() {
      return ['official-public'];
    },
  };

  const works = await searchPublicWorks(catalog, policies, {
    kind: 'official',
    query: '作品',
    sort: 'recent',
    sourceKey: 'catalog',
    status: 'ongoing',
  });

  expect(works).toHaveLength(1);
  expect(works[0]?.work.publications.map((publication) => publication.id)).toEqual([
    'official-public',
  ]);
});
