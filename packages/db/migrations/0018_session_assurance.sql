alter table "user" add column two_factor_enabled boolean not null default false;
--> statement-breakpoint
create table two_factor (
  id text primary key check (length(id) between 1 and 255),
  secret text not null check (length(secret) between 1 and 10_000),
  backup_codes text not null check (length(backup_codes) between 1 and 100_000),
  user_id text not null unique references "user" (id) on delete cascade,
  verified boolean not null default true,
  failed_verification_count integer not null default 0 check (failed_verification_count >= 0),
  locked_until timestamptz
);
--> statement-breakpoint
create index two_factor_secret_idx on two_factor (secret);
--> statement-breakpoint
create type session_assurance as enum ('two_factor');
--> statement-breakpoint
create table session_assurances (
  session_id text primary key references session (id) on delete cascade,
  assurance session_assurance not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);
--> statement-breakpoint
create index session_assurances_expires_at_idx on session_assurances (expires_at);
