create type serial_status as enum ('ongoing', 'hiatus', 'completed', 'unknown');
--> statement-breakpoint
create type work_alias_kind as enum ('alternate', 'former', 'reading');
--> statement-breakpoint
create type publication_kind as enum ('official', 'user_submission', 'unknown');
--> statement-breakpoint
create type publication_entry_kind as enum (
  'regular',
  'extra',
  'republication',
  'announcement',
  'unknown'
);
--> statement-breakpoint
create table works (
  id uuid primary key,
  title text not null check (length(title) between 1 and 500),
  serial_status serial_status not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table work_aliases (
  id uuid primary key,
  work_id uuid not null references works (id),
  kind work_alias_kind not null,
  value text not null check (length(value) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (work_id, kind, value)
);
--> statement-breakpoint
create table creators (
  id uuid primary key,
  name text not null check (length(name) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table work_creators (
  work_id uuid not null references works (id),
  creator_id uuid not null references creators (id),
  role text not null check (length(role) between 1 and 200),
  position integer not null check (position >= 0),
  primary key (work_id, creator_id, role)
);
--> statement-breakpoint
create table sources (
  id uuid primary key,
  key text not null unique check (length(key) between 1 and 100),
  name text not null check (length(name) between 1 and 500),
  base_url text not null check (
    length(base_url) between 1 and 2000
    and base_url ~ '^https?://'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table publications (
  id uuid primary key,
  work_id uuid not null references works (id),
  source_id uuid not null references sources (id),
  external_id text check (
    external_id is null
    or length(external_id) between 1 and 500
  ),
  normalized_url text not null check (
    length(normalized_url) between 1 and 2000
    and normalized_url ~ '^https?://'
  ),
  title text not null check (length(title) between 1 and 500),
  kind publication_kind not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, work_id),
  unique (source_id, normalized_url)
);
--> statement-breakpoint
create unique index publications_source_external_id_idx
  on publications (source_id, external_id)
  where external_id is not null;
--> statement-breakpoint
create index publications_work_id_idx on publications (work_id);
--> statement-breakpoint
create table content_units (
  id uuid primary key,
  work_id uuid not null references works (id),
  title text not null check (length(title) between 1 and 500),
  position integer not null check (position >= 0),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, work_id)
);
--> statement-breakpoint
create index content_units_work_position_idx
  on content_units (work_id, position);
--> statement-breakpoint
create table publication_entries (
  id uuid primary key,
  work_id uuid not null references works (id),
  publication_id uuid not null,
  external_id text check (
    external_id is null
    or length(external_id) between 1 and 500
  ),
  normalized_url text not null check (
    length(normalized_url) between 1 and 2000
    and normalized_url ~ '^https?://'
  ),
  title text not null check (length(title) between 1 and 500),
  kind publication_entry_kind not null,
  position integer not null check (position >= 0),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (publication_id, work_id) references publications (id, work_id),
  unique (id, work_id),
  unique (publication_id, normalized_url)
);
--> statement-breakpoint
create unique index publication_entries_external_id_idx
  on publication_entries (publication_id, external_id)
  where external_id is not null;
--> statement-breakpoint
create index publication_entries_work_position_idx
  on publication_entries (work_id, position);
--> statement-breakpoint
create table entry_content_mappings (
  work_id uuid not null references works (id),
  publication_entry_id uuid not null,
  content_unit_id uuid not null,
  confirmed boolean not null,
  created_at timestamptz not null default now(),
  primary key (publication_entry_id, content_unit_id),
  foreign key (publication_entry_id, work_id)
    references publication_entries (id, work_id),
  foreign key (content_unit_id, work_id)
    references content_units (id, work_id)
);
--> statement-breakpoint
create index entry_content_mappings_content_unit_idx
  on entry_content_mappings (content_unit_id);
