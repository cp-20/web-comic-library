alter table activities
  drop constraint activities_user_id_work_id_fkey;
--> statement-breakpoint
alter table activities
  alter column status drop not null,
  add column content_unit_id uuid,
  add column volume_edition_id uuid,
  add column body text,
  add column spoiler boolean not null default false,
  add column visibility visibility,
  add column updated_at timestamptz not null default now(),
  add foreign key (user_id) references "user" (id) on delete cascade,
  add foreign key (work_id) references works (id) on delete cascade,
  add foreign key (content_unit_id, work_id) references content_units (id, work_id),
  add foreign key (volume_edition_id, work_id) references volume_editions (id, work_id),
  add check (
    (kind = 'review' and status is null and body is not null and length(body) between 1 and 1000
      and visibility is not null and ((content_unit_id is null) <> (volume_edition_id is null)))
    or
    (kind <> 'review' and status is not null and body is null and content_unit_id is null
      and volume_edition_id is null and visibility is null)
  );
--> statement-breakpoint
create index activities_review_content_created_idx
  on activities (content_unit_id, created_at desc, id desc)
  where kind = 'review';
--> statement-breakpoint
create index activities_review_volume_created_idx
  on activities (volume_edition_id, created_at desc, id desc)
  where kind = 'review';
--> statement-breakpoint
create table activity_reactions (
  activity_id uuid not null references activities (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
--> statement-breakpoint
create index activity_reactions_user_created_idx
  on activity_reactions (user_id, created_at desc);
