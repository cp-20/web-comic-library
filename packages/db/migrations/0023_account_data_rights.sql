create type account_data_export_status as enum ('queued', 'ready', 'expired', 'failed');
--> statement-breakpoint
create type account_deletion_status as enum ('requested', 'purged');
--> statement-breakpoint
create table account_data_exports (
  id uuid primary key,
  user_id text not null references "user" (id) on delete cascade,
  download_token_hash text not null unique check (length(download_token_hash) = 64),
  status account_data_export_status not null default 'queued',
  payload jsonb,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz not null,
  check ((status = 'ready') = (payload is not null and ready_at is not null))
);
--> statement-breakpoint
create index account_data_exports_user_requested_idx
  on account_data_exports (user_id, requested_at desc);
--> statement-breakpoint
create index account_data_exports_expires_idx
  on account_data_exports (expires_at) where status = 'ready';
--> statement-breakpoint
create table account_deletion_ledger (
  id uuid primary key,
  user_id text not null unique check (length(user_id) between 1 and 255),
  status account_deletion_status not null default 'requested',
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  completed_at timestamptz,
  check ((status = 'purged') = (completed_at is not null))
);
--> statement-breakpoint
create index account_deletion_ledger_due_idx
  on account_deletion_ledger (purge_after asc) where status = 'requested';
