import { describe, expect, test } from 'bun:test';

import {
  type SourcePolicyEvidence,
  canCollectSource,
  canExposeAgeRating,
  createAgeRatingMapping,
  createSourcePolicyRecord,
} from './source-policy';

const changedAt = new Date('2026-07-25T00:00:00Z');
const termsEvidence: SourcePolicyEvidence = {
  checkedAt: changedAt,
  id: crypto.randomUUID(),
  kind: 'terms',
  url: 'https://source.example/terms',
};

const policy = (collection: 'allowed' | 'denied' | 'unreviewed', emergencyStopped = false) =>
  createSourcePolicyRecord({
    advertising: 'unreviewed',
    affiliate: 'unreviewed',
    changedAt,
    changedBy: 'operator@example.test',
    collection,
    commercialUse: 'unreviewed',
    emergencyStopped,
    evidence: collection === 'unreviewed' && !emergencyStopped ? [] : [termsEvidence],
    id: crypto.randomUUID(),
    revision: 1,
    sourceId: crypto.randomUUID(),
  });

describe('source policy', () => {
  test('allows collection only after an explicit non-robots approval', () => {
    expect(canCollectSource(null)).toBe(false);
    expect(canCollectSource(policy('unreviewed'))).toBe(false);
    expect(canCollectSource(policy('denied'))).toBe(false);
    expect(canCollectSource(policy('allowed', true))).toBe(false);
    expect(canCollectSource(policy('allowed'))).toBe(true);

    expect(() =>
      createSourcePolicyRecord({
        ...policy('allowed'),
        evidence: [
          {
            ...termsEvidence,
            kind: 'robots',
            url: 'https://source.example/robots.txt',
          },
        ],
      }),
    ).toThrow('robots evidence alone cannot allow collection');
  });

  test('exposes only explicitly public source age ratings', () => {
    const allowed = policy('allowed');
    const mapping = (disposition: 'excluded' | 'public' | 'review') =>
      createAgeRatingMapping({
        changedAt,
        changedBy: 'operator@example.test',
        disposition,
        evidenceUrl: 'https://source.example/ratings',
        externalValue: disposition === 'excluded' ? 'R18' : disposition,
        id: crypto.randomUUID(),
        revision: 1,
        sourceId: allowed.sourceId,
      });

    expect(canExposeAgeRating(allowed, mapping('public'))).toBe(true);
    expect(canExposeAgeRating(allowed, mapping('excluded'))).toBe(false);
    expect(canExposeAgeRating(allowed, mapping('review'))).toBe(false);
    expect(canExposeAgeRating(allowed, null)).toBe(false);
    expect(canExposeAgeRating(policy('denied'), mapping('public'))).toBe(false);
    expect(
      canExposeAgeRating(allowed, {
        ...mapping('public'),
        sourceId: crypto.randomUUID(),
      }),
    ).toBe(false);
  });

  test('requires auditable evidence for reviewed policy and mappings', () => {
    expect(() =>
      createSourcePolicyRecord({
        ...policy('denied'),
        evidence: [],
      }),
    ).toThrow('reviewed policy must include evidence');

    expect(() =>
      createAgeRatingMapping({
        changedAt,
        changedBy: '',
        disposition: 'review',
        evidenceUrl: 'file:///ratings',
        externalValue: '',
        id: crypto.randomUUID(),
        revision: 0,
        sourceId: crypto.randomUUID(),
      }),
    ).toThrow();
  });
});
