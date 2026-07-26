create type catalog_redirect_resource as enum ('work', 'content_unit');
--> statement-breakpoint
create type catalog_review_kind as enum (
  'parse_failure',
  'unknown_publication_kind',
  'user_correction'
);
--> statement-breakpoint
create type catalog_review_status as enum ('open', 'resolved');
--> statement-breakpoint
create type catalog_audit_operation as enum (
  'merge_work',
  'split_work',
  'merge_content_unit',
  'split_content_unit'
);
--> statement-breakpoint
create table catalog_redirects (
  resource catalog_redirect_resource not null,
  source_id uuid not null,
  target_id uuid not null,
  created_at timestamptz not null,
  primary key (resource, source_id),
  check (source_id <> target_id)
);
--> statement-breakpoint
create table catalog_merge_audits (
  id uuid primary key,
  operation catalog_audit_operation not null,
  operator_id text not null check (length(operator_id) between 1 and 200),
  reason text not null check (length(reason) between 1 and 2_000),
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null
);
--> statement-breakpoint
create index catalog_merge_audits_created_at_idx on catalog_merge_audits (created_at desc);
--> statement-breakpoint
create table catalog_review_items (
  id uuid primary key,
  kind catalog_review_kind not null,
  status catalog_review_status not null,
  source_id uuid references sources (id),
  dedupe_key text unique check (
    dedupe_key is null
    or length(dedupe_key) between 1 and 500
  ),
  payload jsonb not null,
  created_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by text check (
    resolved_by is null
    or length(resolved_by) between 1 and 200
  ),
  check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null)
  )
);
--> statement-breakpoint
create index catalog_review_items_open_created_at_idx
  on catalog_review_items (created_at asc)
  where status = 'open';
--> statement-breakpoint
alter table publication_entries
  drop constraint publication_entries_publication_id_work_id_fkey,
  add constraint publication_entries_publication_id_work_id_fkey
    foreign key (publication_id, work_id)
    references publications (id, work_id)
    deferrable initially immediate;
--> statement-breakpoint
alter table entry_content_mappings
  drop constraint entry_content_mappings_publication_entry_id_work_id_fkey,
  add constraint entry_content_mappings_publication_entry_id_work_id_fkey
    foreign key (publication_entry_id, work_id)
    references publication_entries (id, work_id)
    deferrable initially immediate,
  drop constraint entry_content_mappings_content_unit_id_work_id_fkey,
  add constraint entry_content_mappings_content_unit_id_work_id_fkey
    foreign key (content_unit_id, work_id)
    references content_units (id, work_id)
    deferrable initially immediate;
