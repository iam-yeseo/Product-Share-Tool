-- 몰별 등록 상태. 기존 done/done_at은 유지하며, 자동화 프로그램이 두 채널 모두 success일 때 done=true로 맞춥니다.
create table if not exists public.product_registrations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.product_items(id) on delete cascade,
  channel text not null check (channel in ('retail','wholesale')),
  status text not null default 'pending' check (status in ('pending','running','success','failed')),
  goods_no text,
  error_message text,
  warnings jsonb not null default '[]'::jsonb,
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, channel)
);
create index if not exists product_registrations_item_id_idx on public.product_registrations(item_id);
alter table public.product_registrations enable row level security;
drop policy if exists product_registrations_anon_all on public.product_registrations;
create policy product_registrations_anon_all on public.product_registrations
  for all to anon, authenticated using (true) with check (true);
