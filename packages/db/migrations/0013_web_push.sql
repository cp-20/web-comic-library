create type web_push_delivery_status as enum ('queued', 'delivered', 'permanent_failure');
--> statement-breakpoint
create table web_push_subscriptions (
  id uuid primary key,
  user_id text not null references "user" (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 1 and 500),
  auth text not null check (length(auth) between 1 and 500),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create index web_push_subscriptions_active_user_idx
  on web_push_subscriptions (user_id, updated_at desc)
  where disabled_at is null;
--> statement-breakpoint
create table web_push_deliveries (
  id uuid primary key,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 500),
  notification_id uuid not null references notifications (id) on delete cascade,
  subscription_id uuid not null references web_push_subscriptions (id) on delete cascade,
  status web_push_delivery_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, subscription_id)
);
--> statement-breakpoint
create index web_push_deliveries_queued_idx
  on web_push_deliveries (created_at asc)
  where status = 'queued';
