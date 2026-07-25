create type policy_decision as enum ('unreviewed', 'allowed', 'denied');
--> statement-breakpoint
create type source_policy_evidence_kind as enum (
  'terms',
  'robots',
  'api',
  'feed',
  'inquiry'
);
--> statement-breakpoint
create type age_rating_disposition as enum ('public', 'excluded', 'review');
--> statement-breakpoint
alter table publications
  add column age_rating_value text check (
    age_rating_value is null
    or length(age_rating_value) between 1 and 200
  ),
  add column purchase_url text check (
    purchase_url is null
    or (
      length(purchase_url) between 1 and 2000
      and purchase_url ~ '^https?://'
    )
  );
--> statement-breakpoint
create table source_policy_records (
  id uuid primary key,
  source_id uuid not null references sources (id),
  revision integer not null check (revision > 0),
  collection policy_decision not null,
  commercial_use policy_decision not null,
  advertising policy_decision not null,
  affiliate policy_decision not null,
  emergency_stopped boolean not null,
  changed_by text not null check (length(changed_by) between 1 and 500),
  changed_at timestamptz not null,
  unique (source_id, revision)
);
--> statement-breakpoint
create index source_policy_records_latest_idx
  on source_policy_records (source_id, revision desc);
--> statement-breakpoint
create table source_policy_evidence (
  id uuid primary key,
  policy_record_id uuid not null references source_policy_records (id),
  kind source_policy_evidence_kind not null,
  checked_at timestamptz not null,
  url text not null check (
    length(url) between 1 and 2000
    and url ~ '^https?://'
  )
);
--> statement-breakpoint
create index source_policy_evidence_record_idx
  on source_policy_evidence (policy_record_id);
--> statement-breakpoint
create table source_age_rating_mappings (
  id uuid primary key,
  source_id uuid not null references sources (id),
  external_value text not null check (length(external_value) between 1 and 200),
  revision integer not null check (revision > 0),
  disposition age_rating_disposition not null,
  evidence_url text not null check (
    length(evidence_url) between 1 and 2000
    and evidence_url ~ '^https?://'
  ),
  changed_by text not null check (length(changed_by) between 1 and 500),
  changed_at timestamptz not null,
  unique (source_id, external_value, revision)
);
--> statement-breakpoint
create index source_age_rating_mappings_latest_idx
  on source_age_rating_mappings (source_id, external_value, revision desc);
