create type follow_mode as enum (
  'fastest',
  'source_priority',
  'selected_publications',
  'all_publications'
);
--> statement-breakpoint
create table user_source_preferences (
  user_id text not null references "user" (id) on delete cascade,
  source_id uuid not null references sources (id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (user_id, source_id),
  unique (user_id, position)
);
--> statement-breakpoint
create table work_follow_settings (
  user_id text not null references "user" (id) on delete cascade,
  work_id uuid not null references works (id) on delete cascade,
  mode follow_mode not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, work_id)
);
--> statement-breakpoint
create table subscription_publications (
  user_id text not null references "user" (id) on delete cascade,
  work_id uuid not null references works (id) on delete cascade,
  publication_id uuid not null,
  primary key (user_id, publication_id),
  foreign key (publication_id, work_id) references publications (id, work_id)
);
--> statement-breakpoint
create index subscription_publications_user_work_idx
  on subscription_publications (user_id, work_id);
