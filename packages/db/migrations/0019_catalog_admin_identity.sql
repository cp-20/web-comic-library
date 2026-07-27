create type catalog_user_role as enum ('user', 'administrator');
--> statement-breakpoint
alter type session_assurance add value 'passkey';
--> statement-breakpoint
alter table "user" add column role catalog_user_role not null default 'user';
--> statement-breakpoint
create table user_role_audits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" (id) on delete cascade,
  previous_role catalog_user_role not null,
  role catalog_user_role not null,
  changed_at timestamptz not null default now(),
  check (previous_role <> role)
);
--> statement-breakpoint
create index user_role_audits_user_changed_at_idx on user_role_audits (user_id, changed_at desc);
--> statement-breakpoint
create table session_assurance_audits (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references session (id) on delete cascade,
  assurance session_assurance not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
--> statement-breakpoint
create index session_assurance_audits_session_recorded_at_idx
  on session_assurance_audits (session_id, recorded_at desc);
--> statement-breakpoint
create function audit_user_role_change() returns trigger language plpgsql as $$
begin
  if old.role is distinct from new.role then
    insert into user_role_audits (user_id, previous_role, role)
    values (new.id, old.role, new.role);
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger user_role_audit_trigger
  after update of role on "user"
  for each row execute function audit_user_role_change();
--> statement-breakpoint
create function audit_session_assurance_change() returns trigger language plpgsql as $$
begin
  insert into session_assurance_audits (session_id, assurance, verified_at, expires_at)
  values (new.session_id, new.assurance, new.verified_at, new.expires_at);
  return new;
end;
$$;
--> statement-breakpoint
create trigger session_assurance_audit_trigger
  after insert or update of assurance, verified_at, expires_at on session_assurances
  for each row execute function audit_session_assurance_change();
