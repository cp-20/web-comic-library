create type notification_channel as enum ('in_app', 'web_push', 'email');
--> statement-breakpoint
create table notification_preferences (
  user_id text not null references "user" (id) on delete cascade,
  kind release_event_kind not null,
  channel notification_channel not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, channel)
);
--> statement-breakpoint
create table notifications (
  id uuid primary key,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 500),
  user_id text not null references "user" (id) on delete cascade,
  release_event_id uuid not null references release_events (id) on delete cascade,
  kind release_event_kind not null,
  channel notification_channel not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, release_event_id, kind, channel)
);
--> statement-breakpoint
create index notifications_user_unread_created_idx
  on notifications (user_id, created_at desc, id desc)
  where read_at is null;
--> statement-breakpoint
create index notifications_user_created_idx
  on notifications (user_id, created_at desc, id desc);
