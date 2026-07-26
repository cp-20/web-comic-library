create table extension_pairing_codes (
  id uuid primary key,
  user_id text not null references "user"(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index extension_pairing_codes_user_expires_idx on extension_pairing_codes (user_id, expires_at desc);

create table extension_tokens (
  id uuid primary key,
  user_id text not null references "user"(id) on delete cascade,
  token_hash text not null unique,
  scope text not null check (scope = 'favorites:import'),
  device_label text not null,
  issued_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create index extension_tokens_user_active_idx on extension_tokens (user_id, issued_at desc) where revoked_at is null;
