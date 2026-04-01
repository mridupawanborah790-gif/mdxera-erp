-- Doctor Master: centralized doctor registry for sales referrals/reporting.

create table if not exists public.doctor_master (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  doctor_code text,
  name text not null,
  qualification text,
  specialization text,
  registration_no text,
  mobile text,
  alternate_contact text,
  email text,
  clinic_name text,
  area text,
  city text,
  state text,
  pincode text,
  commission_percent numeric(5,2),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id uuid references auth.users(id) on delete set null,
  unique (organization_id, doctor_code)
);

create unique index if not exists uq_doctor_master_org_name
  on public.doctor_master (organization_id, lower(name));

create index if not exists idx_doctor_master_org on public.doctor_master (organization_id);
create index if not exists idx_doctor_master_mobile on public.doctor_master (mobile);
create index if not exists idx_doctor_master_specialization on public.doctor_master (specialization);

alter table public.doctor_master enable row level security;

drop policy if exists "Org isolation for doctor_master" on public.doctor_master;
create policy "Org isolation for doctor_master"
  on public.doctor_master
  for all
  using (organization_id = (auth.jwt() ->> 'organization_id'))
  with check (organization_id = (auth.jwt() ->> 'organization_id'));

create or replace function public.update_doctor_master_modtime()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_update_doctor_master_modtime on public.doctor_master;
create trigger tr_update_doctor_master_modtime
before update on public.doctor_master
for each row execute function public.update_doctor_master_modtime();

alter table public.sales_bill
  add column if not exists doctor_id uuid references public.doctor_master(id) on delete set null;
