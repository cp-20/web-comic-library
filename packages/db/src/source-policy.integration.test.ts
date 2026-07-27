import { expect, test } from 'bun:test';

import { findPublicWork } from '@web-comic-library/application';
import {
  createAgeRatingMapping,
  createPublication,
  createSource,
  createSourcePolicyRecord,
  createWork,
} from '@web-comic-library/domain';
import postgres from 'postgres';

import { createPostgresCatalog } from './catalog';
import { migrateDatabase } from './migrate';
import { createPostgresSourcePolicy } from './source-policy';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'source policy gates collection and public catalog output with an audit trail',
  async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const catalog = createPostgresCatalog(databaseUrl);
    const policies = createPostgresSourcePolicy(databaseUrl);
    const source = createSource({
      baseUrl: 'https://policy-test.example/',
      id: crypto.randomUUID(),
      key: `policy-test-${crypto.randomUUID()}`,
      name: 'Policy test source',
    });
    const work = createWork({
      id: crypto.randomUUID(),
      retiredAt: null,
      serialStatus: 'ongoing',
      title: 'Policy test work',
    });
    const publication = (
      title: string,
      ageRatingValue: string | null,
      purchaseUrl: string | null = null,
    ) =>
      createPublication({
        ageRatingValue,
        externalId: crypto.randomUUID(),
        id: crypto.randomUUID(),
        kind: 'official',
        normalizedUrl: `https://policy-test.example/works/${crypto.randomUUID()}`,
        purchaseUrl,
        retiredAt: null,
        sourceId: source.id,
        title,
        workId: work.id,
      });
    const publicPublication = publication(
      '全年齢',
      'all-ages',
      'https://store.example/works/all-ages',
    );
    const adultPublication = publication('成人向け', 'R18');
    const reviewPublication = publication('要確認', 'age-gate');
    const unknownPublication = publication('未確認', null);
    const changedAt = new Date('2026-07-25T01:00:00Z');
    const termsUrl = 'https://policy-test.example/terms';

    try {
      await catalog.createSource(source);
      await catalog.createWork(work);
      await catalog.createPublication(publicPublication);
      await catalog.createPublication(adultPublication);
      await catalog.createPublication(reviewPublication);
      await catalog.createPublication(unknownPublication);
      await policies.recordPolicy(
        createSourcePolicyRecord({
          advertising: 'denied',
          affiliate: 'denied',
          changedAt,
          changedBy: 'policy-operator',
          collection: 'allowed',
          commercialUse: 'denied',
          emergencyStopped: false,
          evidence: [
            {
              checkedAt: changedAt,
              id: crypto.randomUUID(),
              kind: 'terms',
              url: termsUrl,
            },
          ],
          id: crypto.randomUUID(),
          revision: 1,
          sourceId: source.id,
        }),
      );
      await Promise.all([
        policies.recordAgeRatingMapping(
          createAgeRatingMapping({
            changedAt,
            changedBy: 'policy-operator',
            disposition: 'public',
            evidenceUrl: 'https://policy-test.example/ratings',
            externalValue: 'all-ages',
            id: crypto.randomUUID(),
            revision: 1,
            sourceId: source.id,
          }),
        ),
        policies.recordAgeRatingMapping(
          createAgeRatingMapping({
            changedAt,
            changedBy: 'policy-operator',
            disposition: 'excluded',
            evidenceUrl: 'https://policy-test.example/ratings',
            externalValue: 'R18',
            id: crypto.randomUUID(),
            revision: 1,
            sourceId: source.id,
          }),
        ),
        policies.recordAgeRatingMapping(
          createAgeRatingMapping({
            changedAt,
            changedBy: 'policy-operator',
            disposition: 'review',
            evidenceUrl: 'https://policy-test.example/ratings',
            externalValue: 'age-gate',
            id: crypto.randomUUID(),
            revision: 1,
            sourceId: source.id,
          }),
        ),
      ]);

      expect(await policies.canCollect(source.id)).toBe(true);
      expect(await policies.resolveCollectableSourceId(source.key)).toBe(source.id);
      expect(await policies.resolveCollectableSourceId('unregistered-source')).toBeNull();
      expect(await policies.classifyAgeRating(source.id, 'all-ages')).toBe('public');
      expect(await policies.classifyAgeRating(source.id, 'R18')).toBe('excluded');
      expect(await policies.classifyAgeRating(source.id, 'age-gate')).toBe('review');
      expect(await policies.classifyAgeRating(source.id, null)).toBe('review');
      expect(await policies.classifyAgeRating(source.id, 'unmapped')).toBe('review');
      expect(await policies.listPublicPublicationIds(work.id)).toEqual([publicPublication.id]);

      const publicWork = await findPublicWork(catalog, policies, work.id);
      expect(publicWork?.publications).toEqual([
        expect.objectContaining({
          ageRatingValue: 'all-ages',
          id: publicPublication.id,
          normalizedUrl: publicPublication.normalizedUrl,
          purchaseUrl: 'https://store.example/works/all-ages',
        }),
      ]);

      const stoppedAt = new Date('2026-07-25T02:00:00Z');
      const incidentUrl = 'https://policy-test.example/incidents/maintenance';
      await policies.setEmergencyStop({
        changedAt: stoppedAt,
        changedBy: 'incident-operator',
        evidence: {
          checkedAt: stoppedAt,
          id: crypto.randomUUID(),
          kind: 'inquiry',
          url: incidentUrl,
        },
        sourceId: source.id,
        stopped: true,
      });

      expect(await policies.canCollect(source.id)).toBe(false);
      expect(await policies.resolveCollectableSourceId(source.key)).toBeNull();
      expect(await policies.listPublicPublicationIds(work.id)).toEqual([]);
      expect(await findPublicWork(catalog, policies, work.id)).toBeNull();

      const latest = await policies.findLatestPolicy(source.id);
      expect(latest?.revision).toBe(2);
      expect(latest?.changedBy).toBe('incident-operator');
      expect(latest?.changedAt).toEqual(stoppedAt);
      expect(latest?.evidence.map((item) => item.url)).toContain(termsUrl);
      expect(latest?.evidence.map((item) => item.url)).toContain(incidentUrl);

      const revisions = await sql<{ count: number }[]>`
        select count(*)::int as count
        from source_policy_records
        where source_id = ${source.id}
      `;
      expect(revisions[0]?.count).toBe(2);
    } finally {
      await sql`
        delete from source_age_rating_mappings
        where source_id = ${source.id}
      `;
      await sql`
        delete from source_policy_evidence
        where policy_record_id in (
          select id from source_policy_records where source_id = ${source.id}
        )
      `;
      await sql`
        delete from source_policy_records
        where source_id = ${source.id}
      `;
      await sql`
        delete from publications
        where work_id = ${work.id}
      `;
      await sql`delete from sources where id = ${source.id}`;
      await sql`delete from works where id = ${work.id}`;
      await policies.close();
      await catalog.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
