create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 200),
  event_name text not null check (length(event_name) between 1 and 200),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
--> statement-breakpoint
create index outbox_events_pending_idx
  on outbox_events (created_at)
  where published_at is null;
--> statement-breakpoint
create table job_idempotency_keys (
  idempotency_key text primary key check (length(idempotency_key) between 1 and 200),
  task_identifier text not null check (length(task_identifier) between 1 and 200),
  created_at timestamptz not null default now()
);
