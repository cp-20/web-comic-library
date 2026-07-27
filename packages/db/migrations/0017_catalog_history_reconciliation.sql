create function resolve_catalog_redirect(
  requested_resource catalog_redirect_resource,
  requested_id uuid
) returns uuid
language sql
stable
strict
as $$
  with recursive redirect_chain (id, visited) as (
    select requested_id, array[requested_id]
    union all
    select redirect.target_id, chain.visited || redirect.target_id
    from redirect_chain as chain
    join catalog_redirects as redirect
      on redirect.resource = requested_resource and redirect.source_id = chain.id
    where not redirect.target_id = any(chain.visited)
  )
  select id
  from redirect_chain
  order by cardinality(visited) desc
  limit 1
$$;
--> statement-breakpoint
alter table subscription_publications
  drop constraint subscription_publications_publication_id_work_id_fkey,
  add constraint subscription_publications_publication_id_work_id_fkey
    foreign key (publication_id, work_id)
    references publications (id, work_id)
    deferrable initially immediate;
--> statement-breakpoint
alter table volume_content_mappings
  drop constraint volume_content_mappings_volume_edition_id_work_id_fkey,
  add constraint volume_content_mappings_volume_edition_id_work_id_fkey
    foreign key (volume_edition_id, work_id)
    references volume_editions (id, work_id)
    deferrable initially immediate,
  drop constraint volume_content_mappings_content_unit_id_work_id_fkey,
  add constraint volume_content_mappings_content_unit_id_work_id_fkey
    foreign key (content_unit_id, work_id)
    references content_units (id, work_id)
    deferrable initially immediate;
--> statement-breakpoint
alter table user_volume_records
  drop constraint user_volume_records_volume_edition_id_work_id_fkey,
  add constraint user_volume_records_volume_edition_id_work_id_fkey
    foreign key (volume_edition_id, work_id)
    references volume_editions (id, work_id)
    deferrable initially immediate,
  drop constraint user_volume_records_memo_content_unit_id_work_id_fkey,
  add constraint user_volume_records_memo_content_unit_id_work_id_fkey
    foreign key (memo_content_unit_id, work_id)
    references content_units (id, work_id)
    deferrable initially immediate;
