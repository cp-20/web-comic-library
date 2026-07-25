import {
  ageRatingDispositions,
  policyDecisions,
  sourcePolicyEvidenceKinds,
} from '@web-comic-library/domain';
import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { sources } from './catalog-schema';

export const policyDecisionEnum = pgEnum('policy_decision', policyDecisions);
export const sourcePolicyEvidenceKindEnum = pgEnum(
  'source_policy_evidence_kind',
  sourcePolicyEvidenceKinds,
);
export const ageRatingDispositionEnum = pgEnum('age_rating_disposition', ageRatingDispositions);

export const sourcePolicyRecords = pgTable('source_policy_records', {
  advertising: policyDecisionEnum('advertising').notNull(),
  affiliate: policyDecisionEnum('affiliate').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  changedBy: text('changed_by').notNull(),
  collection: policyDecisionEnum('collection').notNull(),
  commercialUse: policyDecisionEnum('commercial_use').notNull(),
  emergencyStopped: boolean('emergency_stopped').notNull(),
  id: uuid('id').primaryKey(),
  revision: integer('revision').notNull(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
});

export const sourcePolicyEvidence = pgTable('source_policy_evidence', {
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  id: uuid('id').primaryKey(),
  kind: sourcePolicyEvidenceKindEnum('kind').notNull(),
  policyRecordId: uuid('policy_record_id')
    .notNull()
    .references(() => sourcePolicyRecords.id),
  url: text('url').notNull(),
});

export const sourceAgeRatingMappings = pgTable('source_age_rating_mappings', {
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  changedBy: text('changed_by').notNull(),
  disposition: ageRatingDispositionEnum('disposition').notNull(),
  evidenceUrl: text('evidence_url').notNull(),
  externalValue: text('external_value').notNull(),
  id: uuid('id').primaryKey(),
  revision: integer('revision').notNull(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
});
