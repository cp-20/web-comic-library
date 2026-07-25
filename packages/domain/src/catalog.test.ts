import { describe, expect, test } from 'bun:test';

import {
  createContentUnit,
  createEntryContentMapping,
  createPublication,
  createPublicationEntry,
  createWork,
  isCatchUpEntryKind,
} from './catalog';

const workId = crypto.randomUUID();

describe('catalog domain', () => {
  test('keeps work identity independent from source identifiers', () => {
    const work = createWork({
      id: workId,
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '作品',
    });
    const publication = createPublication({
      ageRatingValue: 'all-ages',
      externalId: 'source-work-1',
      id: crypto.randomUUID(),
      kind: 'official',
      normalizedUrl: 'https://example.com/works/1',
      purchaseUrl: 'https://store.example.com/works/1',
      retiredAt: null,
      sourceId: crypto.randomUUID(),
      title: 'サイト上の作品名',
      workId: work.id,
    });

    expect(work).toEqual({
      id: workId,
      retiredAt: null,
      serialStatus: 'ongoing',
      title: '作品',
    });
    expect(publication.externalId).toBe('source-work-1');
  });

  test('maps entries and content units only within one work', () => {
    const entry = createPublicationEntry({
      externalId: 'episode-1',
      id: crypto.randomUUID(),
      kind: 'regular',
      normalizedUrl: 'https://example.com/episodes/1',
      position: 0,
      publicationId: crypto.randomUUID(),
      publishedAt: null,
      retiredAt: null,
      title: '第1話',
      workId,
    });
    const contentUnit = createContentUnit({
      id: crypto.randomUUID(),
      position: 0,
      retiredAt: null,
      title: '第1話',
      workId,
    });

    expect(createEntryContentMapping(entry, contentUnit, true)).toEqual({
      confirmed: true,
      contentUnitId: contentUnit.id,
      publicationEntryId: entry.id,
      workId,
    });

    expect(() =>
      createEntryContentMapping(entry, { ...contentUnit, workId: crypto.randomUUID() }, false),
    ).toThrow('must belong to the same work');
  });

  test('limits catch-up entries to regular and extra episodes', () => {
    expect(isCatchUpEntryKind('regular')).toBe(true);
    expect(isCatchUpEntryKind('extra')).toBe(true);
    expect(isCatchUpEntryKind('republication')).toBe(false);
    expect(isCatchUpEntryKind('announcement')).toBe(false);
    expect(isCatchUpEntryKind('unknown')).toBe(false);
  });

  test('rejects invalid titles, URLs, and positions', () => {
    expect(() =>
      createWork({
        id: workId,
        retiredAt: null,
        serialStatus: 'unknown',
        title: ' ',
      }),
    ).toThrow('title must not be empty');

    expect(() =>
      createContentUnit({
        id: crypto.randomUUID(),
        position: -1,
        retiredAt: null,
        title: '第1話',
        workId,
      }),
    ).toThrow('position must be a non-negative safe integer');

    expect(() =>
      createPublication({
        ageRatingValue: null,
        externalId: '',
        id: crypto.randomUUID(),
        kind: 'unknown',
        normalizedUrl: 'https://example.com/work',
        purchaseUrl: null,
        retiredAt: null,
        sourceId: crypto.randomUUID(),
        title: '作品',
        workId,
      }),
    ).toThrow('externalId must not be empty');

    expect(() =>
      createPublication({
        ageRatingValue: null,
        externalId: null,
        id: crypto.randomUUID(),
        kind: 'unknown',
        normalizedUrl: 'file:///tmp/work',
        purchaseUrl: null,
        retiredAt: null,
        sourceId: crypto.randomUUID(),
        title: '作品',
        workId,
      }),
    ).toThrow('must use HTTP or HTTPS');
  });
});
