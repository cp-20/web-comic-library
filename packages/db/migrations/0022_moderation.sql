alter type catalog_user_role add value 'moderator' before 'administrator';
--> statement-breakpoint
create type report_target_kind as enum ('profile', 'activity', 'reaction');
--> statement-breakpoint
create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
--> statement-breakpoint
create type moderation_action_kind as enum ('hide', 'warn', 'suspend', 'restore');
--> statement-breakpoint
create table user_blocks (
  blocker_user_id text not null references "user" (id) on delete cascade,
  blocked_user_id text not null references "user" (id) on delete cascade,
  created_at timestamptz not null,
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
--> statement-breakpoint
create index user_blocks_blocked_created_idx on user_blocks (blocked_user_id, created_at desc);
--> statement-breakpoint
create table user_mutes (
  muter_user_id text not null references "user" (id) on delete cascade,
  muted_user_id text not null references "user" (id) on delete cascade,
  created_at timestamptz not null,
  primary key (muter_user_id, muted_user_id),
  check (muter_user_id <> muted_user_id)
);
--> statement-breakpoint
create index user_mutes_muted_created_idx on user_mutes (muted_user_id, created_at desc);
--> statement-breakpoint
create table reports (
  id uuid primary key,
  reporter_user_id text not null references "user" (id) on delete cascade,
  target_kind report_target_kind not null,
  target_id text not null check (length(target_id) between 1 and 200),
  reason text not null check (length(reason) between 1 and 2000),
  status report_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (reporter_user_id, target_kind, target_id)
);
--> statement-breakpoint
create index reports_status_updated_idx on reports (status, updated_at asc, id asc);
--> statement-breakpoint
create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports (id) on delete set null,
  actor_user_id text not null references "user" (id),
  action moderation_action_kind not null,
  target_kind text not null check (target_kind in ('profile', 'activity')),
  target_id text not null check (length(target_id) between 1 and 200),
  reason text not null check (length(reason) between 1 and 2000),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create index moderation_actions_report_created_idx on moderation_actions (report_id, created_at desc, id desc);
--> statement-breakpoint
create index moderation_actions_target_created_idx on moderation_actions (target_kind, target_id, created_at desc, id desc);
--> statement-breakpoint
alter table activities add column hidden_at timestamptz;
--> statement-breakpoint
create index activities_visible_timeline_idx on activities (user_id, created_at desc, id desc) where hidden_at is null;
