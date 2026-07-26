create type volume_reading_status as enum ('unread', 'reading', 'read');
--> statement-breakpoint
create table user_volume_records (
  user_id text not null references "user" (id) on delete cascade,
  volume_edition_id uuid not null,
  work_id uuid not null,
  status volume_reading_status not null,
  owns_paper boolean not null default false,
  owns_digital boolean not null default false,
  memo_content_unit_id uuid,
  visibility visibility,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, volume_edition_id),
  foreign key (volume_edition_id, work_id)
    references volume_editions (id, work_id),
  foreign key (memo_content_unit_id, work_id)
    references content_units (id, work_id)
);
--> statement-breakpoint
create index user_volume_records_user_work_idx
  on user_volume_records (user_id, work_id, updated_at desc);
