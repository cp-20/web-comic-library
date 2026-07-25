import { describe, expect, test } from 'bun:test';

import type { Connector, SourceCrawlState } from '@web-comic-library/application';
import { discoverIfActive } from '@web-comic-library/application';

const state = (status: 'active' | 'stopped'): SourceCrawlState => ({
  checkpoint: null,
  consecutiveFailures: status === 'stopped' ? 3 : 0,
  sourceId: crypto.randomUUID(),
  status,
  updatedAt: new Date('2026-07-25T00:00:00Z'),
});

describe('worker connector crawl gate', () => {
  test('does not invoke a stopped connector', async () => {
    const stopped = state('stopped');
    let discoveries = 0;
    const connector: Connector = {
      discover: () => {
        discoveries += 1;
        return Promise.resolve({ candidates: [], checkpoint: {} });
      },
      fetchPublication: () => {
        throw new Error('not used');
      },
    };

    expect(
      await discoverIfActive(
        connector,
        { findSourceCrawlState: () => Promise.resolve(stopped) },
        { checkpoint: null, sourceId: stopped.sourceId },
      ),
    ).toEqual({ status: 'stopped' });
    expect(discoveries).toBe(0);
  });

  test('invokes an active connector', async () => {
    const active = state('active');
    const connector: Connector = {
      discover: () => Promise.resolve({ candidates: [], checkpoint: { cursor: 'next' } }),
      fetchPublication: () => {
        throw new Error('not used');
      },
    };

    expect(
      await discoverIfActive(
        connector,
        { findSourceCrawlState: () => Promise.resolve(active) },
        { checkpoint: null, sourceId: active.sourceId },
      ),
    ).toEqual({
      batch: { candidates: [], checkpoint: { cursor: 'next' } },
      status: 'discovered',
    });
  });
});
