create type account_status as enum ('active', 'disabled', 'pending_deletion');
--> statement-breakpoint
create type visibility as enum ('public', 'followers', 'private');
--> statement-breakpoint
create table "user" (
  id text primary key check (length(id) between 1 and 255),
  name text not null check (length(name) between 1 and 100),
  email text not null unique check (length(email) between 3 and 320),
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
--> statement-breakpoint
create table session (
  id text primary key check (length(id) between 1 and 255),
  expires_at timestamptz not null,
  token text not null unique check (length(token) between 1 and 1000),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  ip_address text,
  user_agent text,
  user_id text not null references "user" (id) on delete cascade
);
--> statement-breakpoint
create index session_user_id_idx on session (user_id);
--> statement-breakpoint
create table account (
  id text primary key check (length(id) between 1 and 255),
  account_id text not null check (length(account_id) between 1 and 500),
  provider_id text not null check (length(provider_id) between 1 and 100),
  user_id text not null references "user" (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (provider_id, account_id)
);
--> statement-breakpoint
create index account_user_id_idx on account (user_id);
--> statement-breakpoint
create table verification (
  id text primary key check (length(id) between 1 and 255),
  identifier text not null check (length(identifier) between 1 and 1000),
  value text not null check (length(value) between 1 and 10_000),
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
--> statement-breakpoint
create index verification_identifier_idx on verification (identifier);
--> statement-breakpoint
create table profiles (
  user_id text primary key references "user" (id) on delete cascade,
  public_id text not null unique check (public_id ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  bio text check (bio is null or length(bio) <= 1000),
  icon_url text check (icon_url is null or icon_url ~ '^https://'),
  default_visibility visibility,
  account_status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table profile_followers (
  follower_user_id text not null references "user" (id) on delete cascade,
  followed_user_id text not null references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);
--> statement-breakpoint
create index profile_followers_followed_idx on profile_followers (followed_user_id);
