-- Patch: schema-compatibility helpers for company_auto_gl_defaults.
-- Fixes runtime/sync failures when expected columns are absent in older DBs.

-- Ensure required columns exist on set_of_books (error observed: default_customer_gl_id missing).
alter table if exists public.set_of_books
  add column if not exists default_customer_gl_id uuid references public.gl_master(id) on delete restrict,
  add column if not exists default_supplier_gl_id uuid references public.gl_master(id) on delete restrict,
  add column if not exists active_status text not null default 'Active' check (active_status in ('Active', 'Inactive')),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text not null default 'system';

create index if not exists idx_set_of_books_default_customer_gl on public.set_of_books(default_customer_gl_id);
create index if not exists idx_set_of_books_default_supplier_gl on public.set_of_books(default_supplier_gl_id);

-- Ensure required columns exist on gl_master for seeded defaults and validations.
alter table if exists public.gl_master
  add column if not exists posting_allowed boolean not null default true,
  add column if not exists control_account boolean not null default false,
  add column if not exists active_status text not null default 'Active' check (active_status in ('Active', 'Inactive')),
  add column if not exists seeded_by_system boolean not null default false,
  add column if not exists template_version text not null default 'v1.0',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text not null default 'system';

-- Ensure customers/suppliers have group + control fields used by auto-map trigger.
alter table if exists public.customers
  add column if not exists customer_group text not null default 'Sundry Debtors',
  add column if not exists control_gl_id uuid references public.gl_master(id) on delete restrict;

alter table if exists public.suppliers
  add column if not exists supplier_group text not null default 'Sundry Creditors',
  add column if not exists control_gl_id uuid references public.gl_master(id) on delete restrict;

create index if not exists idx_customers_control_gl on public.customers(control_gl_id);
create index if not exists idx_suppliers_control_gl on public.suppliers(control_gl_id);

-- Optional safety trigger for set_of_books default control GL type rules (idempotent).
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
