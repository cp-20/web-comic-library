import { expect, test } from 'bun:test';

import type {
  ExtensionTokenRepository,
  FavoriteImportRepository,
  FollowRepository,
  LibraryRepository,
  TransactionPort,
} from '@web-comic-library/application';
import { TransactionContext } from '@web-comic-library/application';
import type { FavoriteImportBatch, FavoriteImportCandidate } from '@web-comic-library/domain';
import { hc } from 'hono/client';

import { createApp } from './app';

const isCreatedImport = (
  value: unknown,
): value is Readonly<{ batchId: string; confirmationUrl: string }> =>
  typeof value === 'object' &&
  value !== null &&
  'batchId' in value &&
  typeof value.batchId === 'string' &&
  'confirmationUrl' in value &&
  typeof value.confirmationUrl === 'string';

test('extension RPC accepts only import-scoped tokens and batch owners can apply a batch', async () => {
  let batch: FavoriteImportBatch | null = null;
  const candidates: FavoriteImportCandidate[] = [];
  let sessionUser = 'reader';
  const transactions: TransactionPort = {
    async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
      return operation(new TransactionContext());
    },
  };
  const extensionTokens: ExtensionTokenRepository = {
    async consumePairingCode() {
      return null;
    },
    async createPairingCode() {},
    async createToken() {},
    async findActiveTokenUserUuid(scope) {
      return scope === 'favorites:import' ? 'reader' : null;
    },
    async revokeToken() {
      return false;
    },
  };
  const favorites: FavoriteImportRepository = {
    async claimBatch(_context, batchId, now, userUuid) {
      if (!batch || batch.id !== batchId || batch.userUuid !== userUuid || batch.confirmedAt)
        return false;
      batch = { ...batch, confirmedAt: now };
      return true;
    },
    async createBatch(_context, value) {
      batch = value;
    },
    async createCandidates(_context, batchId, inputs) {
      candidates.push(
        ...inputs.map(
          (input): FavoriteImportCandidate => ({
            alternativeWorkIds: [],
            batchId,
            canonicalUrl: input.canonicalUrl,
            externalWorkId: input.externalWorkId,
            id: 'candidate-1',
            matchKind: 'exact',
            matchedPublicationId: 'publication-1',
            matchedWorkId: 'work-1',
            sourceId: input.sourceId,
            title: input.title,
            titleMatchWorkIds: [],
          }),
        ),
      );
    },
    async discardBatch() {
      return false;
    },
    async findBatch(_batchId, userUuid) {
      return batch?.userUuid === userUuid ? batch : null;
    },
    async listCandidates() {
      return candidates;
    },
  };
  const library: LibraryRepository = {
    async deleteContentReadRecords() {},
    async deletePublicationReadRecords() {},
    async findLibraryEntry() {
      return null;
    },
    async findWorkReadModel() {
      return null;
    },
    async listReadContentUnitIds() {
      return [];
    },
    async saveContentReadRecords() {},
    async saveLibraryEntry() {},
    async savePublicationReadRecords() {},
  };
  const follow: FollowRepository = {
    async findFollowSettings() {
      return null;
    },
    async listSourcePreferences() {
      return [];
    },
    async listSubscriptionPublicationIds() {
      return [];
    },
    async replaceSourcePreferences() {
      return [];
    },
    async replaceSubscriptionPublications() {
      return [];
    },
    async saveFollowSettings() {},
  };
  const protectedApp = createApp({
    extensionTokens,
    favoriteImports: favorites,
    follow,
    library,
    transactions,
    async resolveSession() {
      return { accountStatus: 'active', email: 'reader@example.test', userUuid: sessionUser };
    },
  });
  const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
  const extensionClient = hc<typeof protectedApp>('http://api.test', {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const headers = new Headers(init?.headers);
      headers.set('authorization', 'Bearer import-token');
      return protectedApp.request(input, { ...init, headers });
    },
  });

  const unauthorized = await client.api.extension['favorite-imports'].$post({
    json: {
      favorites: [
        {
          canonicalUrl: 'https://reader.example/works/1',
          externalWorkId: 'work-1',
          sourceId: 'source-1',
          title: '作品1',
        },
      ],
    },
  });
  expect(unauthorized.status).toBe(401);

  const created = await extensionClient.api.extension['favorite-imports'].$post({
    json: {
      favorites: [
        {
          canonicalUrl: 'https://reader.example/works/1',
          externalWorkId: 'work-1',
          sourceId: 'source-1',
          title: '作品1',
        },
      ],
    },
  });
  expect(created.status).toBe(201);
  const body: unknown = await created.json();
  if (!isCreatedImport(body)) throw new Error('favorite import response is invalid');
  expect(body.confirmationUrl).toContain('/settings/extension/imports/');

  sessionUser = 'other-reader';
  const inaccessible = await client.api['favorite-imports'][':batchId'].$get({
    param: { batchId: body.batchId },
  });
  expect(inaccessible.status).toBe(404);

  sessionUser = 'reader';
  const applied = await client.api['favorite-imports'][':batchId'].apply.$post({
    json: {
      defaults: { followMode: 'all_publications', readingStatus: null },
      selections: [{ candidateId: 'candidate-1' }],
    },
    param: { batchId: body.batchId },
  });
  expect(applied.status).toBe(200);
  expect(await applied.json()).toEqual({ status: 'applied' });
});
