create type reading_status as enum ('want_to_read', 'reading', 'paused', 'dropped', 'completed');
--> statement-breakpoint
create table library_entries (
  user_id text not null references "user" (id) on delete cascade,
  work_id uuid not null references works (id) on delete cascade,
  status reading_status not null,
  visibility visibility,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_id)
);
--> statement-breakpoint
create table library_status_history (
  id bigint generated always as identity primary key,
  user_id text not null references "user" (id) on delete cascade,
  work_id uuid not null references works (id) on delete cascade,
  status reading_status not null,
  changed_at timestamptz not null
);
--> statement-breakpoint
create index library_status_history_user_work_changed_idx
  on library_status_history (user_id, work_id, changed_at desc, id desc);
--> statement-breakpoint
create table content_read_records (
  user_id text not null references "user" (id) on delete cascade,
  work_id uuid not null references works (id) on delete cascade,
  content_unit_id uuid not null references content_units (id) on delete cascade,
  visibility visibility,
  read_at timestamptz not null,
  primary key (user_id, content_unit_id)
);
--> statement-breakpoint
create index content_read_records_user_work_idx on content_read_records (user_id, work_id);
--> statement-breakpoint
create table publication_read_records (
  user_id text not null references "user" (id) on delete cascade,
  work_id uuid not null references works (id) on delete cascade,
  publication_entry_id uuid not null references publication_entries (id) on delete cascade,
  visibility visibility,
  read_at timestamptz not null,
  primary key (user_id, publication_entry_id)
);
--> statement-breakpoint
create index publication_read_records_user_work_idx on publication_read_records (user_id, work_id);
