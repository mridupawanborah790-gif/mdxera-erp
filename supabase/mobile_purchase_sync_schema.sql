-- Mobile purchase sync queue for Magic Mobile Link
create table if not exists public.mobile_purchase_sync (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  organization_id text not null,
  user_id text not null,
  device_id text not null,
  invoice_id text not null,
  payload jsonb not null,
  status text not null default 'synced' check (status in ('synced', 'imported', 'failed')),
  imported_at timestamptz,
  import_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mobile_purchase_sync_lookup
  on public.mobile_purchase_sync (organization_id, user_id, device_id, status, created_at desc);

create index if not exists idx_mobile_purchase_sync_session
  on public.mobile_purchase_sync (session_id, created_at desc);

alter table public.mobile_purchase_sync enable row level security;

drop policy if exists "Org isolation for mobile_purchase_sync" on public.mobile_purchase_sync;
create policy "Org isolation for mobile_purchase_sync"
  on public.mobile_purchase_sync for all
  using (organization_id = (auth.jwt() ->> 'organization_id'))
  with check (organization_id = (auth.jwt() ->> 'organization_id'));

create or replace function public.update_mobile_purchase_sync_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_mobile_purchase_sync_modtime on public.mobile_purchase_sync;
create trigger tr_mobile_purchase_sync_modtime
before update on public.mobile_purchase_sync
for each row execute function public.update_mobile_purchase_sync_updated_at();
