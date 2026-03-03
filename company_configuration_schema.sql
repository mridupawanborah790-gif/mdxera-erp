-- Company Configuration schema for:
-- 1) Company Code
-- 2) Set of Books
-- 3) GL Master
-- 4) GL Assignment
-- 5) Setup Wizard / Defaults Log
-- + GL Assignment history for future-effective audit
-- IMPORTANT: run this SQL file content directly; do NOT paste git diff hunks (e.g. lines starting with @@, +, -),
-- otherwise PostgreSQL will throw syntax error 42601 near '@@'.
-- Prefer running: supabase/company_configuration_default_company_migration.sql for default-company rollout.

create extension if not exists pgcrypto;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.company_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  code text not null,
  description text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  is_default boolean not null default false,
  default_set_of_books_id text,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_by text not null default 'system',
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.set_of_books (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  company_code_id uuid not null references public.company_codes(id) on delete restrict,
  set_of_books_id text not null,
  description text,
  default_currency text not null default 'INR',
  default_customer_gl_id uuid,
  default_supplier_gl_id uuid,
  active_status text not null default 'Active' check (active_status in ('Active', 'Inactive')),
  posting_count integer not null default 0,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_by text not null default 'system',
  updated_at timestamptz not null default now(),
  unique (organization_id, company_code_id, set_of_books_id)
);

create unique index if not exists uq_set_of_books_company_and_code
  on public.set_of_books(company_code_id, set_of_books_id);


alter table if exists public.company_codes
  drop constraint if exists fk_company_codes_default_set_of_books;
alter table if exists public.company_codes
  add constraint fk_company_codes_default_set_of_books
  foreign key (id, default_set_of_books_id)
  references public.set_of_books(company_code_id, set_of_books_id)
  on update cascade;

create table if not exists public.gl_master (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  set_of_books_id uuid not null references public.set_of_books(id) on delete restrict,
  gl_code text not null,
  gl_name text not null,
  gl_type text not null check (gl_type in ('Asset', 'Expense', 'Income', 'Liability', 'Equity')),
  posting_allowed boolean not null default true,
  control_account boolean not null default false,
  active_status text not null default 'Active' check (active_status in ('Active', 'Inactive')),
  seeded_by_system boolean not null default false,
  template_version text not null default 'v1.0',
  posting_count integer not null default 0,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_by text not null default 'system',
  updated_at timestamptz not null default now(),
  unique (organization_id, set_of_books_id, gl_code)
);

create table if not exists public.gl_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  set_of_books_id uuid not null references public.set_of_books(id) on delete restrict,
  material_master_type text not null check (material_master_type in ('Trading Goods', 'Finished Goods', 'Consumables', 'Service Material', 'Packaging')),
  inventory_gl uuid references public.gl_master(id) on delete restrict,
  purchase_gl uuid not null references public.gl_master(id) on delete restrict,
  cogs_gl uuid not null references public.gl_master(id) on delete restrict,
  sales_gl uuid references public.gl_master(id) on delete restrict,
  discount_gl uuid not null references public.gl_master(id) on delete restrict,
  tax_gl uuid not null references public.gl_master(id) on delete restrict,
  seeded_by_system boolean not null default false,
  template_version text not null default 'v1.0',
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_by text not null default 'system',
  updated_at timestamptz not null default now(),
  unique (organization_id, set_of_books_id, material_master_type)
);

create table if not exists public.setup_wizard_defaults_log (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  set_of_books_id uuid not null references public.set_of_books(id) on delete cascade,
  action text not null check (action in ('DEFAULT_CREATED', 'RESET_DEFAULT')),
  message text not null,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists public.gl_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  assignment_id uuid,
  set_of_books_id uuid not null references public.set_of_books(id) on delete cascade,
  material_master_type text not null,
  changed_at timestamptz not null default now(),
  changed_by text not null default 'system',
  effective_from timestamptz not null default now(),
  previous_payload jsonb not null default '{}'::jsonb,
  next_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_company_codes_org on public.company_codes(organization_id);
create unique index if not exists uq_company_codes_one_default_per_org
  on public.company_codes(organization_id)
  where is_default = true;
create index if not exists idx_set_of_books_org on public.set_of_books(organization_id);
create index if not exists idx_gl_master_org_sob on public.gl_master(organization_id, set_of_books_id);
create index if not exists idx_set_of_books_default_customer_gl on public.set_of_books(default_customer_gl_id);
create index if not exists idx_set_of_books_default_supplier_gl on public.set_of_books(default_supplier_gl_id);
create index if not exists idx_gl_assignments_org_sob on public.gl_assignments(organization_id, set_of_books_id);
create index if not exists idx_setup_logs_org on public.setup_wizard_defaults_log(organization_id);
create index if not exists idx_gl_assignment_history_org on public.gl_assignment_history(organization_id);

-- GL assignment type validation rules
create or replace function public.validate_gl_assignment_types()
returns trigger
language plpgsql
as $$
declare
  inv_type text;
  pur_type text;
  cogs_type text;
  sales_type text;
  dis_type text;
  tax_type text;
begin
  if new.inventory_gl is not null then
    select gl_type into inv_type from public.gl_master where id = new.inventory_gl;
    if inv_type is distinct from 'Asset' then
      raise exception 'Inventory GL must be Asset';
    end if;
  end if;

  select gl_type into pur_type from public.gl_master where id = new.purchase_gl;
  if pur_type is distinct from 'Expense' then
    raise exception 'Purchase GL must be Expense';
  end if;

  select gl_type into cogs_type from public.gl_master where id = new.cogs_gl;
  if cogs_type is distinct from 'Expense' then
    raise exception 'COGS GL must be Expense';
  end if;

  if new.sales_gl is not null then
    select gl_type into sales_type from public.gl_master where id = new.sales_gl;
    if sales_type is distinct from 'Income' then
      raise exception 'Sales GL must be Income';
    end if;
  end if;

  select gl_type into dis_type from public.gl_master where id = new.discount_gl;
  if dis_type is distinct from 'Expense' then
    raise exception 'Discount GL must be Expense';
  end if;

  select gl_type into tax_type from public.gl_master where id = new.tax_gl;
  if tax_type is distinct from 'Liability' then
    raise exception 'Tax GL must be Liability';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_gl_assignment_types on public.gl_assignments;
create trigger trg_validate_gl_assignment_types
before insert or update on public.gl_assignments
for each row
execute function public.validate_gl_assignment_types();

create or replace function public.validate_set_of_books_default_controls()
returns trigger
language plpgsql
as $$
declare
  customer_type text;
  supplier_type text;
begin
  if new.default_customer_gl_id is not null then
    select gl_type into customer_type from public.gl_master where id = new.default_customer_gl_id;
    if customer_type is distinct from 'Asset' then
      raise exception 'Customer Control GL must be Asset';
    end if;
  end if;

  if new.default_supplier_gl_id is not null then
    select gl_type into supplier_type from public.gl_master where id = new.default_supplier_gl_id;
    if supplier_type is distinct from 'Liability' then
      raise exception 'Supplier Control GL must be Liability';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_set_of_books_default_controls on public.set_of_books;
create trigger trg_validate_set_of_books_default_controls
before insert or update on public.set_of_books
for each row
execute function public.validate_set_of_books_default_controls();

create or replace function public.restrict_control_gl_edits()
returns trigger
language plpgsql
as $$
begin
  if old.control_account and old.posting_count > 0 then
    if new.gl_code is distinct from old.gl_code
      or new.gl_type is distinct from old.gl_type
      or new.posting_allowed is distinct from old.posting_allowed
      or new.active_status is distinct from old.active_status
      or new.control_account is distinct from old.control_account then
      raise exception 'Control GL with postings can only update gl_name';
    end if;
  end if;

  if old.gl_code = '120000' and new.gl_type is distinct from 'Asset' then
    raise exception 'Customer Control GL must remain Asset';
  end if;

  if old.gl_code = '210000' and new.gl_type is distinct from 'Liability' then
    raise exception 'Supplier Control GL must remain Liability';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_control_gl_edits on public.gl_master;
create trigger trg_restrict_control_gl_edits
before update on public.gl_master
for each row
execute function public.restrict_control_gl_edits();

-- updated_at trigger

drop trigger if exists trg_company_codes_updated_at on public.company_codes;
create trigger trg_company_codes_updated_at before update on public.company_codes for each row execute function public.set_row_updated_at();

drop trigger if exists trg_set_of_books_updated_at on public.set_of_books;
create trigger trg_set_of_books_updated_at before update on public.set_of_books for each row execute function public.set_row_updated_at();

drop trigger if exists trg_gl_master_updated_at on public.gl_master;
create trigger trg_gl_master_updated_at before update on public.gl_master for each row execute function public.set_row_updated_at();

drop trigger if exists trg_gl_assignments_updated_at on public.gl_assignments;
create trigger trg_gl_assignments_updated_at before update on public.gl_assignments for each row execute function public.set_row_updated_at();

-- RLS
alter table public.company_codes enable row level security;
alter table public.set_of_books enable row level security;
alter table public.gl_master enable row level security;
alter table public.gl_assignments enable row level security;
alter table public.setup_wizard_defaults_log enable row level security;
alter table public.gl_assignment_history enable row level security;

-- Policies assume profiles(user_id, organization_id) exists.
drop policy if exists p_company_codes_org on public.company_codes;
create policy p_company_codes_org on public.company_codes
for all
using (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
)
with check (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
);

drop policy if exists p_set_of_books_org on public.set_of_books;
create policy p_set_of_books_org on public.set_of_books
for all
using (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
)
with check (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
);

drop policy if exists p_gl_master_org on public.gl_master;
create policy p_gl_master_org on public.gl_master
for all
using (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
)
with check (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
);

drop policy if exists p_gl_assignments_org on public.gl_assignments;
create policy p_gl_assignments_org on public.gl_assignments
for all
using (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
)
with check (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
);

drop policy if exists p_setup_logs_org on public.setup_wizard_defaults_log;
create policy p_setup_logs_org on public.setup_wizard_defaults_log
for all
using (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
)
with check (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
);

drop policy if exists p_gl_assignment_history_org on public.gl_assignment_history;
create policy p_gl_assignment_history_org on public.gl_assignment_history
for all
using (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
)
with check (
  organization_id::text in (select p.organization_id::text from public.profiles p where p.user_id = auth.uid())
);
