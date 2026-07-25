import { connectorFailureCodes, sourceCrawlStatuses } from '@web-comic-library/application';
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { sources } from './catalog-schema';

export const sourceCrawlStatusEnum = pgEnum('source_crawl_status', sourceCrawlStatuses);
export const connectorFailureCodeEnum = pgEnum('connector_failure_code', connectorFailureCodes);

export const fetchResourceStates = pgTable('fetch_resource_states', {
  bodyHash: text('body_hash').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  etag: text('etag'),
  lastModified: text('last_modified'),
  resourceUrl: text('resource_url').notNull(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
});

export const sourceCrawlStates = pgTable('source_crawl_states', {
  checkpoint: jsonb('checkpoint'),
  consecutiveFailures: integer('consecutive_failures').notNull(),
  sourceId: uuid('source_id')
    .primaryKey()
    .references(() => sources.id),
  status: sourceCrawlStatusEnum('status').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const crawlRuns = pgTable('crawl_runs', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer('duration_ms').notNull(),
  failureCode: connectorFailureCodeEnum('failure_code'),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  id: uuid('id').primaryKey(),
  parseFailureCount: integer('parse_failure_count').notNull(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  successCount: integer('success_count').notNull(),
});
