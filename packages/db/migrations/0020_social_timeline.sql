create type follow_status as enum ('pending', 'accepted', 'rejected');
--> statement-breakpoint
create type activity_kind as enum ('reading_status', 'completed', 'review');
--> statement-breakpoint
create table user_follows (
  follower_user_id text not null references "user" (id) on delete cascade,
  followed_user_id text not null references "user" (id) on delete cascade,
  status follow_status not null,
  created_at timestamptz not null,
  responded_at timestamptz,
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id),
  check ((status = 'pending' and responded_at is null) or (status in ('accepted', 'rejected') and responded_at is not null))
);
--> statement-breakpoint
create index user_follows_followed_status_created_idx
  on user_follows (followed_user_id, status, created_at desc);
--> statement-breakpoint
create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  work_id uuid not null,
  kind activity_kind not null,
  status reading_status not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, work_id) references library_entries (user_id, work_id) on delete cascade
);
--> statement-breakpoint
create index activities_user_created_idx on activities (user_id, created_at desc, id desc);
--> statement-breakpoint
create index activities_work_created_idx on activities (work_id, created_at desc, id desc);
