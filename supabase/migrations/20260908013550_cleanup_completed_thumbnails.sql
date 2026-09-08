-- 등록 완료 3일 후 썸네일을 Storage API로 정리합니다.
-- DB에서 storage.objects를 직접 지우면 실제 파일이 고아로 남으므로, Cron이 Edge Function을 호출하게 합니다.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.get_product_thumbnail_cleanup_candidates(
  p_cutoff timestamptz,
  p_limit integer default 1000
)
returns table (
  item_id uuid,
  list_id uuid,
  image_url text,
  thumbnail_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    item.id as item_id,
    item.list_id,
    item.image_url,
    item.automation->'thumbnail'->>'path' as thumbnail_path
  from public.product_items as item
  where item.done = true
    and item.done_at <= p_cutoff
    and coalesce(item.image_url, '') <> ''
    and coalesce(item.automation->'thumbnail'->>'path', '') <> ''
    and item.automation->'thumbnail'->>'path' like item.list_id::text || '/' || item.id::text || '/%'
  order by item.done_at, item.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;

revoke all on function public.get_product_thumbnail_cleanup_candidates(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_product_thumbnail_cleanup_candidates(timestamptz, integer) to service_role;

create or replace function public.finalize_product_thumbnail_cleanup(
  p_item_id uuid,
  p_expected_path text,
  p_deleted_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  update public.product_items
  set image_url = '',
      automation = jsonb_set(
        jsonb_set(
          coalesce(automation, '{}'::jsonb) #- '{thumbnail,path}',
          '{thumbnail,deletedAt}',
          to_jsonb(p_deleted_at),
          true
        ),
        '{thumbnail,retentionDays}',
        '3'::jsonb,
        true
      )
  where id = p_item_id
    and done = true
    and done_at <= now() - interval '3 days'
    and automation->'thumbnail'->>'path' = p_expected_path;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.finalize_product_thumbnail_cleanup(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_product_thumbnail_cleanup(uuid, text, timestamptz) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'product_tool_project_url') then
    perform vault.create_secret(
      'https://giuqapykceosroauaijq.supabase.co',
      'product_tool_project_url',
      'Product tool URL for the thumbnail cleanup Cron job'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'product_tool_publishable_key') then
    perform vault.create_secret(
      'sb_publishable_NfLmTDmFVb-p1yvi1rGzlA_Fbq0rEN9',
      'product_tool_publishable_key',
      'Publishable key used only to authenticate the thumbnail cleanup Cron request'
    );
  end if;
end
$$;

select cron.schedule(
  'cleanup-product-thumbnails-daily',
  '20 18 * * *', -- 매일 03:20 Asia/Seoul (18:20 UTC)
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'product_tool_project_url') || '/functions/v1/cleanup-product-thumbnails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'product_tool_publishable_key')
    ),
    body := jsonb_build_object('source', 'supabase-cron')
  );
  $$
);
