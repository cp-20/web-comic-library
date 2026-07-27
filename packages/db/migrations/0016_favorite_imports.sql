create type favorite_import_match_kind as enum ('exact', 'ambiguous', 'unmatched');
--> statement-breakpoint
create table favorite_import_batches (
  id uuid primary key,
  user_id text not null references "user" (id) on delete cascade,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (not (confirmed_at is not null and discarded_at is not null))
);
--> statement-breakpoint
create index favorite_import_batches_user_active_idx
  on favorite_import_batches (user_id, created_at desc)
  where confirmed_at is null and discarded_at is null;
--> statement-breakpoint
create table favorite_import_candidates (
  id uuid primary key,
  batch_id uuid not null references favorite_import_batches (id) on delete cascade,
  source_id uuid not null references sources (id),
  external_work_id text,
  canonical_url text not null check (
    length(canonical_url) between 1 and 2000
    and canonical_url ~ '^https?://'
    and canonical_url !~ '[?#]'
  ),
  title text not null check (length(title) between 1 and 500),
  match_kind favorite_import_match_kind not null,
  matched_work_id uuid references works (id),
  matched_publication_id uuid references publications (id),
  alternative_work_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(alternative_work_ids) = 'array'),
  title_match_work_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(title_match_work_ids) = 'array'),
  created_at timestamptz not null default now(),
  unique (batch_id, source_id, canonical_url),
  check (
    (match_kind = 'exact' and matched_work_id is not null and matched_publication_id is not null)
    or (match_kind <> 'exact' and matched_work_id is null and matched_publication_id is null)
  )
);
--> statement-breakpoint
create index favorite_import_candidates_batch_idx on favorite_import_candidates (batch_id, id);
