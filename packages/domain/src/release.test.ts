import { expect, test } from 'bun:test';

import {
  canAutomaticallyMapEntries,
  canAutomaticallyMergeWorks,
  createReleaseEvent,
  normalizeAuthorNames,
  normalizeComparableText,
  parseEpisodeIdentity,
  releaseEventKindForEntry,
} from './release';

test('release matching normalizes Unicode only for exact work and author matches', () => {
  expect(normalizeComparableText(' ＡＢＣ　作品 ')).toBe('abc 作品');
  expect(normalizeAuthorNames(['作者Ａ', '作者A', ' 原作者 '])).toEqual(['作者a', '原作者']);
  expect(
    canAutomaticallyMergeWorks(
      { authors: [' 作者Ａ '], kind: 'official', title: 'ＡＢＣ　作品' },
      { authors: ['作者A'], kind: 'official', title: 'abc 作品' },
    ),
  ).toBe(true);
  expect(
    canAutomaticallyMergeWorks(
      { authors: ['作者A'], kind: 'official', title: '同名作品' },
      { authors: ['作者B'], kind: 'official', title: '同名作品' },
    ),
  ).toBe(false);
  expect(
    canAutomaticallyMergeWorks(
      { authors: ['作者A'], kind: 'official', title: '作品' },
      { authors: ['作者A'], kind: 'user_submission', title: '作品' },
    ),
  ).toBe(false);
});

test('release matching maps only exact one-to-one episodes and rejects split publications', () => {
  expect(parseEpisodeIdentity('第12話')).toEqual({ branch: null, number: 12 });
  expect(parseEpisodeIdentity('第12話 (2)')).toEqual({ branch: '2', number: 12 });
  expect(parseEpisodeIdentity('第12話①')).toBeNull();
  expect(parseEpisodeIdentity('第12話 前編')).toBeNull();
  expect(
    canAutomaticallyMapEntries(
      { kind: 'regular', title: '第12話' },
      { kind: 'regular', title: '第１２話' },
    ),
  ).toBe(true);
  expect(
    canAutomaticallyMapEntries(
      { kind: 'regular', title: '第12話' },
      { kind: 'regular', title: '第12話 前編' },
    ),
  ).toBe(false);
  expect(
    canAutomaticallyMapEntries(
      { kind: 'regular', title: '第12話' },
      { kind: 'regular', title: '第13話' },
    ),
  ).toBe(false);
});

test('release events require stable identity and valid timestamps', () => {
  expect(releaseEventKindForEntry('announcement', '単行本第3巻発売')).toBe('new_volume');
  expect(releaseEventKindForEntry('announcement', 'お知らせ')).toBe('announcement');
  expect(releaseEventKindForEntry('unknown', '第1話')).toBeNull();

  const event = createReleaseEvent({
    id: crypto.randomUUID(),
    idempotencyKey: 'release:source:entry:new_episode:2026-07-27T00:00:00.000Z',
    kind: 'new_episode',
    notificationSuppressed: true,
    occurredAt: new Date('2026-07-27T00:00:00Z'),
    publicationEntryId: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
  });

  expect(event.notificationSuppressed).toBe(true);
  expect(() => createReleaseEvent({ ...event, idempotencyKey: ' ' })).toThrow();
});
