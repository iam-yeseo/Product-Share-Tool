-- Additive price-field migration. Existing product data and completion state are preserved.
alter table public.product_items
  add column if not exists price_retail_regular bigint;

comment on column public.product_items.price_retail_regular is '소매몰 정가';
comment on column public.product_items.price_retail is '소매몰 판매가 · 도매몰 정가';

create or replace function public.save_product_draft(p_list jsonb, p_items jsonb, p_removed_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_list uuid := (p_list->>'id')::uuid;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Invalid items'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) e join public.product_items i on i.id=(e->>'id')::uuid where i.list_id<>v_list) then
    raise exception 'Product belongs to another list';
  end if;
  update public.product_lists set title=coalesce(nullif(p_list->>'title',''),'제목 없는 리스트'), author=coalesce(p_list->>'author',''), work_date=nullif(p_list->>'work_date','')::date, updated_at=now() where id=v_list;
  if not found then raise exception 'List not found'; end if;
  delete from public.product_items where list_id=v_list and id=any(coalesce(p_removed_ids,'{}'::uuid[]));
  insert into public.product_items (id,list_id,seq,brand,name_own,name_naver,model,content,image_usage,need_retail,need_wholesale,need_naver,price_retail_regular,price_retail,price_wholesale,price_wholesale_master,price_naver,image_url,ref_link,note,automation)
  select x.id,v_list,x.seq,x.brand,x.name_own,x.name_naver,x.model,x.content,x.image_usage,x.need_retail,x.need_wholesale,x.need_naver,x.price_retail_regular,x.price_retail,x.price_wholesale,x.price_wholesale_master,x.price_naver,x.image_url,x.ref_link,x.note,coalesce(x.automation,'{}'::jsonb)
  from jsonb_to_recordset(p_items) as x(id uuid,seq integer,brand text,name_own text,name_naver text,model text,content text,image_usage text,need_retail text,need_wholesale text,need_naver text,price_retail_regular bigint,price_retail bigint,price_wholesale bigint,price_wholesale_master bigint,price_naver bigint,image_url text,ref_link text,note text,automation jsonb)
  on conflict (id) do update set seq=excluded.seq,brand=excluded.brand,name_own=excluded.name_own,name_naver=excluded.name_naver,model=excluded.model,content=excluded.content,image_usage=excluded.image_usage,need_retail=excluded.need_retail,need_wholesale=excluded.need_wholesale,need_naver=excluded.need_naver,price_retail_regular=excluded.price_retail_regular,price_retail=excluded.price_retail,price_wholesale=excluded.price_wholesale,price_wholesale_master=excluded.price_wholesale_master,price_naver=excluded.price_naver,image_url=excluded.image_url,ref_link=excluded.ref_link,note=excluded.note,automation=excluded.automation,updated_at=now();
end;
$$;

revoke all on function public.save_product_draft(jsonb,jsonb,uuid[]) from public;
grant execute on function public.save_product_draft(jsonb,jsonb,uuid[]) to anon, authenticated;
