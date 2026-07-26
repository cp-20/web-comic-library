create extension if not exists pg_trgm;
--> statement-breakpoint
create index works_search_title_trgm_idx
  on works using gin (lower(normalize(title, NFKC)) gin_trgm_ops)
  where retired_at is null;
--> statement-breakpoint
create index work_aliases_search_value_trgm_idx
  on work_aliases using gin (lower(normalize(value, NFKC)) gin_trgm_ops);
--> statement-breakpoint
create index creators_search_name_trgm_idx
  on creators using gin (lower(normalize(name, NFKC)) gin_trgm_ops);
--> statement-breakpoint
create index library_entries_recent_popularity_idx
  on library_entries (work_id, created_at desc);
