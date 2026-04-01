create table public.doctor_master (
  id uuid not null default gen_random_uuid (),
  organization_id text not null,
  doctor_code text null,
  name text not null,
  qualification text null,
  specialization text null,
  registration_no text null,
  mobile text null,
  alternate_contact text null,
  email text null,
  clinic_name text null,
  area text null,
  city text null,
  state text null,
  pincode text null,
  commission_percent numeric(5, 2) null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by_id uuid null,
  constraint doctor_master_pkey primary key (id),
  constraint doctor_master_organization_id_doctor_code_key unique (organization_id, doctor_code),
  constraint doctor_master_created_by_id_fkey foreign key (created_by_id) references auth.users (id) on delete set null
) tablespace pg_default;

create unique index if not exists uq_doctor_master_org_name
on public.doctor_master using btree (organization_id, lower(name)) tablespace pg_default;

create index if not exists idx_doctor_master_org
on public.doctor_master using btree (organization_id) tablespace pg_default;

create index if not exists idx_doctor_master_mobile
on public.doctor_master using btree (mobile) tablespace pg_default;

create index if not exists idx_doctor_master_specialization
on public.doctor_master using btree (specialization) tablespace pg_default;

create or replace function public.update_doctor_master_modtime()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tr_update_doctor_master_modtime before
update on doctor_master for each row
execute function update_doctor_master_modtime ();
