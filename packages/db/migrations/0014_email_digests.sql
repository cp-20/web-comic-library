create type email_digest_status as enum ('queued', 'sent', 'permanent_failure');
--> statement-breakpoint
create table email_digest_settings (
  user_id text primary key references "user" (id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null default 'UTC' check (length(timezone) between 1 and 100),
  send_time time not null default '09:00',
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table email_digests (
  id uuid primary key,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 500),
  user_id text not null references "user" (id) on delete cascade,
  local_date date not null,
  status email_digest_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
--> statement-breakpoint
create table email_digest_notifications (
  digest_id uuid not null references email_digests (id) on delete cascade,
  notification_id uuid not null references notifications (id) on delete cascade,
  primary key (digest_id, notification_id)
);
--> statement-breakpoint
create type email_digest_feedback_kind as enum ('bounce', 'complaint');
--> statement-breakpoint
create table email_digest_feedbacks (
  id uuid primary key,
  provider_event_id text not null unique check (length(provider_event_id) between 1 and 500),
  user_id text not null references "user" (id) on delete cascade,
  kind email_digest_feedback_kind not null,
  received_at timestamptz not null default now()
);
--> statement-breakpoint
create index email_digests_queued_idx on email_digests (created_at asc) where status = 'queued';
