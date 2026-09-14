-- Product indexing is independent from request lists. Existing product data is preserved.
alter table public.product_lists add column if not exists note text not null default '';

create table if not exists public.product_indexing (
  id uuid primary key default gen_random_uuid(),
  brand_ref text not null,
  brand_name text not null,
  name text not null,
  detail_html text not null default '',
  images jsonb not null default '[]'::jsonb,
  html_source text not null default 'generated' check (html_source in ('generated','manual')),
  retail_enabled boolean not null default false,
  retail_url text not null default '',
  wholesale_enabled boolean not null default false,
  wholesale_url text not null default '',
  smartstore_enabled boolean not null default false,
  smartstore_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_indexing_brand_ref_idx on public.product_indexing(brand_ref);
create index if not exists product_indexing_updated_at_idx on public.product_indexing(updated_at desc);
alter table public.product_indexing enable row level security;
grant select, insert, update, delete on table public.product_indexing to anon, authenticated;
drop policy if exists product_indexing_anon_all on public.product_indexing;
create policy product_indexing_anon_all on public.product_indexing
  for all to anon, authenticated using (true) with check (true);

create or replace function public.touch_product_indexing_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists product_indexing_touch_updated_at on public.product_indexing;
create trigger product_indexing_touch_updated_at before update on public.product_indexing
for each row execute function public.touch_product_indexing_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_indexing'
  ) then
    alter publication supabase_realtime add table public.product_indexing;
  end if;
end;
$$;

create or replace function public.save_product_draft(p_list jsonb, p_items jsonb, p_removed_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_list uuid := (p_list->>'id')::uuid;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Invalid items'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) e join public.product_items i on i.id=(e->>'id')::uuid where i.list_id<>v_list) then
    raise exception 'Product belongs to another list';
  end if;
  update public.product_lists set title=coalesce(nullif(p_list->>'title',''),'제목 없는 리스트'), author=coalesce(p_list->>'author',''), note=coalesce(p_list->>'note',''), work_date=nullif(p_list->>'work_date','')::date, updated_at=now() where id=v_list;
  if not found then raise exception 'List not found'; end if;
  delete from public.product_items where list_id=v_list and id=any(coalesce(p_removed_ids,'{}'::uuid[]));
  insert into public.product_items (id,list_id,seq,brand,name_own,name_naver,model,content,image_usage,need_retail,need_wholesale,need_naver,price_retail_regular,price_retail,price_wholesale,price_wholesale_master,price_naver,image_url,ref_link,note,automation)
  select x.id,v_list,x.seq,x.brand,x.name_own,x.name_naver,x.model,x.content,x.image_usage,x.need_retail,x.need_wholesale,x.need_naver,x.price_retail_regular,x.price_retail,x.price_wholesale,x.price_wholesale_master,x.price_naver,x.image_url,x.ref_link,x.note,coalesce(x.automation,'{}'::jsonb)
  from jsonb_to_recordset(p_items) as x(id uuid,seq integer,brand text,name_own text,name_naver text,model text,content text,image_usage text,need_retail text,need_wholesale text,need_naver text,price_retail_regular bigint,price_retail bigint,price_wholesale bigint,price_wholesale_master bigint,price_naver bigint,image_url text,ref_link text,note text,automation jsonb)
  on conflict (id) do update set seq=excluded.seq,brand=excluded.brand,name_own=excluded.name_own,name_naver=excluded.name_naver,model=excluded.model,content=excluded.content,image_usage=excluded.image_usage,need_retail=excluded.need_retail,need_wholesale=excluded.need_wholesale,need_naver=excluded.need_naver,price_retail_regular=excluded.price_retail_regular,price_retail=excluded.price_retail,price_wholesale=excluded.price_wholesale,price_wholesale_master=excluded.price_wholesale_master,price_naver=excluded.price_naver,image_url=excluded.image_url,ref_link=excluded.ref_link,note=excluded.note,automation=excluded.automation,updated_at=now();
end;
$$;

-- Completion checks, automation status updates, and row edits all appear in recent activity.
create or replace function public.touch_product_list_from_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.product_lists set updated_at = now() where id = coalesce(new.list_id, old.list_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists product_items_touch_list on public.product_items;
create trigger product_items_touch_list after insert or update or delete on public.product_items
for each row execute function public.touch_product_list_from_item();

create or replace function public.touch_product_list_from_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.product_lists set updated_at = now()
  where id = (select list_id from public.product_items where id = coalesce(new.item_id, old.item_id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists product_registrations_touch_list on public.product_registrations;
create trigger product_registrations_touch_list after insert or update or delete on public.product_registrations
for each row execute function public.touch_product_list_from_registration();
