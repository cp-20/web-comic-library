create type source_crawl_status as enum ('active', 'stopped');
--> statement-breakpoint
create type connector_failure_code as enum (
  'body_too_large',
  'content_type',
  'disallowed_host',
  'http_status',
  'network',
  'parse',
  'prohibited_resource',
  'rate_limited',
  'redirect',
  'timeout',
  'validation'
);
--> statement-breakpoint
create table fetch_resource_states (
  source_id uuid not null references sources (id),
  resource_url text not null check (
    length(resource_url) between 1 and 2000
    and resource_url ~ '^https?://'
  ),
  etag text,
  last_modified text,
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  checked_at timestamptz not null,
  primary key (source_id, resource_url)
);
--> statement-breakpoint
create table source_crawl_states (
  source_id uuid primary key references sources (id),
  checkpoint jsonb,
  consecutive_failures integer not null check (consecutive_failures >= 0),
  status source_crawl_status not null,
  updated_at timestamptz not null
);
--> statement-breakpoint
create table crawl_runs (
  id uuid primary key,
  source_id uuid not null references sources (id),
  started_at timestamptz not null,
  finished_at timestamptz not null check (finished_at >= started_at),
  duration_ms integer not null check (duration_ms >= 0),
  success_count integer not null check (success_count >= 0),
  parse_failure_count integer not null check (parse_failure_count >= 0),
  failure_code connector_failure_code,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create index crawl_runs_source_finished_idx
  on crawl_runs (source_id, finished_at desc);
