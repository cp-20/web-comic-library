import {
  publicationEntryKinds,
  publicationKinds,
  serialStatuses,
  workAliasKinds,
} from '@web-comic-library/domain';
import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const serialStatusEnum = pgEnum('serial_status', serialStatuses);
export const workAliasKindEnum = pgEnum('work_alias_kind', workAliasKinds);
export const publicationKindEnum = pgEnum('publication_kind', publicationKinds);
export const publicationEntryKindEnum = pgEnum('publication_entry_kind', publicationEntryKinds);

export const works = pgTable('works', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: uuid('id').primaryKey(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  serialStatus: serialStatusEnum('serial_status').notNull(),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workAliases = pgTable('work_aliases', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: uuid('id').primaryKey(),
  kind: workAliasKindEnum('kind').notNull(),
  value: text('value').notNull(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id),
});

export const creators = pgTable('creators', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workCreators = pgTable('work_creators', {
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => creators.id),
  position: integer('position').notNull(),
  role: text('role').notNull(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id),
});

export const sources = pgTable('sources', {
  baseUrl: text('base_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: uuid('id').primaryKey(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const publications = pgTable('publications', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  externalId: text('external_id'),
  id: uuid('id').primaryKey(),
  kind: publicationKindEnum('kind').notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id),
});

export const contentUnits = pgTable('content_units', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: uuid('id').primaryKey(),
  position: integer('position').notNull(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id),
});

export const publicationEntries = pgTable('publication_entries', {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  externalId: text('external_id'),
  id: uuid('id').primaryKey(),
  kind: publicationEntryKindEnum('kind').notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  position: integer('position').notNull(),
  publicationId: uuid('publication_id').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id),
});

export const entryContentMappings = pgTable('entry_content_mappings', {
  confirmed: boolean('confirmed').notNull(),
  contentUnitId: uuid('content_unit_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publicationEntryId: uuid('publication_entry_id').notNull(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id),
});
