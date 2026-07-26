import { expect, test } from 'bun:test';

import { createR2ObjectClient, createR2ProfileIconStorage } from './profile-icon-storage';

test('stores sanitized icon bytes under an owner-scoped R2 object key', async () => {
  const calls: Array<{ body: Uint8Array; contentType: 'image/png'; key: string }> = [];
  const storage = createR2ProfileIconStorage({
    client: {
      async putObject(input) {
        calls.push(input);
      },
    },
    publicBaseUrl: 'https://assets.example/',
  });
  const userUuid = '00000000-0000-4000-8000-000000000001';
  await expect(storage.put(userUuid, 'image/png', new Uint8Array([1]))).resolves.toBe(
    `https://assets.example/profile-icons/${userUuid}.png`,
  );
  expect(calls).toEqual([
    { body: new Uint8Array([1]), contentType: 'image/png', key: `profile-icons/${userUuid}.png` },
  ]);
});

test('signs a PNG PUT for the configured R2 bucket without exposing credentials', async () => {
  const requests: Request[] = [];
  const client = createR2ObjectClient({
    accessKeyId: 'access-key',
    bucket: 'profile-icons',
    endpoint: 'https://account-id.r2.cloudflarestorage.com',
    fetchImplementation: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(null, { status: 200 });
    },
    secretAccessKey: 'not-logged-secret',
  });

  await client.putObject({
    body: new Uint8Array([137, 80, 78, 71]),
    contentType: 'image/png',
    key: 'profile-icons/11111111-1111-1111-1111-111111111111.png',
  });

  expect(requests[0]?.url).toBe(
    'https://account-id.r2.cloudflarestorage.com/profile-icons/profile-icons/11111111-1111-1111-1111-111111111111.png',
  );
  expect(requests[0]?.headers.get('content-type')).toBe('image/png');
  expect(requests[0]?.headers.get('authorization')).toContain('Credential=access-key/');
  expect(requests[0]?.headers.get('authorization')).not.toContain('not-logged-secret');
});
