create type bibliography_provider as enum ('openbd', 'ndl', 'publisher');
--> statement-breakpoint
create type volume_publication_status as enum ('active', 'withdrawn');
--> statement-breakpoint
create type volume_content_mapping_status as enum ('confirmed', 'unconfirmed', 'rejected');
--> statement-breakpoint
create type bibliography_field as enum ('title', 'authors', 'publisher', 'published_at', 'cover');
--> statement-breakpoint
create table volume_editions (
  id uuid primary key,
  work_id uuid not null references works (id),
  isbn text check (isbn is null or isbn ~ '^97[89][0-9]{10}$'),
  publisher_product_id text check (
    publisher_product_id is null
    or length(publisher_product_id) between 1 and 500
  ),
  title text not null check (length(title) between 1 and 500),
  authors text[] not null default '{}'::text[],
  publisher text,
  published_at date,
  cover_url text,
  cover_license_url text,
  publication_status volume_publication_status not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, work_id),
  check (isbn is not null or publisher_product_id is not null),
  check (
    (cover_url is null and cover_license_url is null)
    or (cover_url ~ '^https://' and cover_license_url ~ '^https://')
  )
);
--> statement-breakpoint
create unique index volume_editions_isbn_idx on volume_editions (isbn) where isbn is not null;
--> statement-breakpoint
create unique index volume_editions_publisher_product_idx
  on volume_editions (publisher_product_id)
  where publisher_product_id is not null;
--> statement-breakpoint
create index volume_editions_work_id_idx on volume_editions (work_id);
--> statement-breakpoint
create table volume_provider_records (
  volume_edition_id uuid not null references volume_editions (id),
  provider bibliography_provider not null,
  found boolean not null,
  fetched_at timestamptz not null,
  source_url text not null check (source_url ~ '^https://'),
  terms_url text not null check (terms_url ~ '^https://'),
  primary key (volume_edition_id, provider)
);
--> statement-breakpoint
create table volume_field_provenances (
  volume_edition_id uuid not null references volume_editions (id),
  field bibliography_field not null,
  provider bibliography_provider not null,
  value jsonb not null,
  fetched_at timestamptz not null,
  terms_url text not null check (terms_url ~ '^https://'),
  primary key (volume_edition_id, field, provider)
);
--> statement-breakpoint
create table volume_content_mappings (
  volume_edition_id uuid not null,
  content_unit_id uuid not null,
  work_id uuid not null references works (id),
  status volume_content_mapping_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (volume_edition_id, content_unit_id),
  foreign key (volume_edition_id, work_id) references volume_editions (id, work_id),
  foreign key (content_unit_id, work_id) references content_units (id, work_id)
);
--> statement-breakpoint
alter table release_events alter column source_id drop not null;
--> statement-breakpoint
alter table release_events alter column publication_entry_id drop not null;
--> statement-breakpoint
alter table release_events add column volume_edition_id uuid references volume_editions (id);
--> statement-breakpoint
alter table release_events add column bibliography_provider bibliography_provider;
--> statement-breakpoint
alter table release_events add constraint release_events_target_check check (
  (publication_entry_id is not null and source_id is not null and volume_edition_id is null and bibliography_provider is null)
  or (publication_entry_id is null and source_id is null and volume_edition_id is not null and bibliography_provider is not null)
);
--> statement-breakpoint
create index release_events_volume_occurred_idx
  on release_events (volume_edition_id, occurred_at desc)
  where volume_edition_id is not null;
