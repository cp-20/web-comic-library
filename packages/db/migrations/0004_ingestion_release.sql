create type release_event_kind as enum (
  'announcement',
  'availability_changed',
  'extra',
  'new_episode',
  'new_volume',
  'republication'
);
--> statement-breakpoint
create table work_ingestion_keys (
  work_id uuid primary key references works (id),
  normalized_title text not null check (length(normalized_title) between 1 and 500),
  normalized_authors text[] not null check (cardinality(normalized_authors) > 0),
  publication_kind publication_kind not null,
  unique (normalized_title, normalized_authors, publication_kind)
);
--> statement-breakpoint
create table release_events (
  id uuid primary key,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 500),
  source_id uuid not null references sources (id),
  publication_entry_id uuid not null references publication_entries (id),
  kind release_event_kind not null,
  occurred_at timestamptz not null,
  notification_suppressed boolean not null,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create index release_events_entry_occurred_idx
  on release_events (publication_entry_id, occurred_at desc);
