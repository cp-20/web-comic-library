import { describe, expect, test } from 'bun:test';

import { runSourceCollection } from '@web-comic-library/application';

describe('worker source policy gate', () => {
  test('does not request or enqueue while collection is disabled', async () => {
    let requests = 0;
    let enqueues = 0;

    const result = await runSourceCollection(
      { canCollect: () => Promise.resolve(false) },
      crypto.randomUUID(),
      () => {
        requests += 1;
        return Promise.resolve('candidate');
      },
      () => {
        enqueues += 1;
        return Promise.resolve('queued');
      },
    );

    expect(result).toEqual({ status: 'disabled' });
    expect(requests).toBe(0);
    expect(enqueues).toBe(0);
  });

  test('does not enqueue when an emergency stop starts after the request', async () => {
    let checks = 0;
    let enqueues = 0;

    const result = await runSourceCollection(
      {
        canCollect: () => {
          checks += 1;
          return Promise.resolve(checks === 1);
        },
      },
      crypto.randomUUID(),
      () => Promise.resolve('candidate'),
      () => {
        enqueues += 1;
        return Promise.resolve('queued');
      },
    );

    expect(result).toEqual({ status: 'stopped' });
    expect(enqueues).toBe(0);
  });

  test('requests and enqueues while the policy remains allowed', async () => {
    const result = await runSourceCollection(
      { canCollect: () => Promise.resolve(true) },
      crypto.randomUUID(),
      () => Promise.resolve('candidate'),
      (candidate) => Promise.resolve(`${candidate}:queued`),
    );

    expect(result).toEqual({ result: 'candidate:queued', status: 'enqueued' });
  });
});
