-- Customer Group-wise GL Creation + Assignment + Auto Customer GL Mapping
-- Compatibility-focused migration for existing databases where table structure may differ.
-- Safe/idempotent: uses IF EXISTS / IF NOT EXISTS and defensive DO blocks.

begin;

-- =====================================================================
-- 0) Preconditions / baseline columns expected in existing schema
-- =====================================================================
-- This script expects these base tables to already exist in your DB:
--   public.gl_master, public.set_of_books, public.gl_assignments, public.customers
--
-- It adds missing columns/constraints/triggers required for PARTY_GROUP mappings.

-- =====================================================================
-- 1) Extend gl_assignments to support PARTY_GROUP mapping rows
-- =====================================================================
alter table if exists public.gl_assignments
  add column if not exists assignment_scope text,
  add column if not exists party_type text,
  add column if not exists party_group text,
  add column if not exists control_gl_id uuid;

-- Ensure default + not null for assignment_scope after backfilling old rows.
update public.gl_assignments
set assignment_scope = coalesce(nullif(assignment_scope, ''), 'MATERIAL')
where assignment_scope is null or assignment_scope = '';

alter table if exists public.gl_assignments
  alter column assignment_scope set default 'MATERIAL';

alter table if exists public.gl_assignments
  alter column assignment_scope set not null;

-- Add FK on control_gl_id only if it doesn't exist already.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_gl_assignments_control_gl'
      and conrelid = 'public.gl_assignments'::regclass
  ) then
    alter table public.gl_assignments
      add constraint fk_gl_assignments_control_gl
      foreign key (control_gl_id) references public.gl_master(id) on delete restrict;
  end if;
end
$$;

-- PARTY_GROUP rows should keep material columns nullable.
alter table if exists public.gl_assignments
  alter column material_master_type drop not null,
  alter column inventory_gl drop not null,
  alter column purchase_gl drop not null,
  alter column cogs_gl drop not null,
  alter column sales_gl drop not null,
  alter column discount_gl drop not null,
  alter column tax_gl drop not null;

-- Drop legacy broad unique constraint if present; replace with scoped indexes.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'gl_assignments_organization_id_set_of_books_id_material_master_type_key'
      and conrelid = 'public.gl_assignments'::regclass
  ) then
    alter table public.gl_assignments
      drop constraint gl_assignments_organization_id_set_of_books_id_material_master_type_key;
  end if;
end
$$;

-- Replace/ensure checks.
alter table if exists public.gl_assignments
  drop constraint if exists gl_assignments_assignment_scope_check;
alter table if exists public.gl_assignments
  add constraint gl_assignments_assignment_scope_check
  check (assignment_scope in ('MATERIAL', 'PARTY_GROUP'));

alter table if exists public.gl_assignments
  drop constraint if exists gl_assignments_party_type_check;
alter table if exists public.gl_assignments
  add constraint gl_assignments_party_type_check
  check (party_type is null or party_type in ('Customer', 'Supplier'));

-- Scoped uniqueness
create unique index if not exists uq_gl_assignments_material_scope
  on public.gl_assignments (organization_id, set_of_books_id, material_master_type)
  where assignment_scope = 'MATERIAL';

create unique index if not exists uq_gl_assignments_party_scope
  on public.gl_assignments (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP';

create index if not exists idx_gl_assignments_party_lookup
  on public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group);

-- Optional: keep existing performance index
create index if not exists idx_gl_assignments_org_sob
  on public.gl_assignments(organization_id, set_of_books_id);

-- =====================================================================
-- 2) Scope-aware validation trigger on gl_assignments
-- =====================================================================
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
  ctrl_type text;
  ctrl_posting_allowed boolean;
begin
  -- Normalize blanks for robust validation
  if new.assignment_scope is null or btrim(new.assignment_scope) = '' then
    new.assignment_scope := 'MATERIAL';
  end if;

  if new.assignment_scope = 'PARTY_GROUP' then
    if new.party_type is null or btrim(new.party_type) = '' then
      raise exception 'party_type is required for PARTY_GROUP assignment';
    end if;

    if new.party_group is null or btrim(new.party_group) = '' then
      raise exception 'party_group is required for PARTY_GROUP assignment';
    end if;

    if new.control_gl_id is null then
      raise exception 'control_gl_id is required for PARTY_GROUP assignment';
    end if;

    select g.gl_type, g.posting_allowed
      into ctrl_type, ctrl_posting_allowed
    from public.gl_master g
    where g.id = new.control_gl_id;

    if ctrl_type is null then
      raise exception 'control_gl_id does not exist in gl_master';
    end if;

    if new.party_type = 'Customer' and ctrl_type is distinct from 'Asset' then
      raise exception 'Customer Group GL must be Asset type';
    end if;

    if new.party_type = 'Supplier' and ctrl_type is distinct from 'Liability' then
      raise exception 'Supplier Group GL must be Liability type';
    end if;

    if ctrl_posting_allowed then
      raise exception 'Control account behavior violation: control_gl_id must be non-posting';
    end if;

    -- PARTY_GROUP rows must not carry material-only fields
    if new.material_master_type is not null
      or new.inventory_gl is not null
      or new.purchase_gl is not null
      or new.cogs_gl is not null
      or new.sales_gl is not null
      or new.discount_gl is not null
      or new.tax_gl is not null then
      raise exception 'PARTY_GROUP assignment must not include material mapping columns';
    end if;

    return new;
  end if;

  -- MATERIAL validation
  if new.material_master_type is null then
    raise exception 'material_master_type is required for MATERIAL assignment';
  end if;

  if new.purchase_gl is null or new.cogs_gl is null or new.discount_gl is null or new.tax_gl is null then
    raise exception 'purchase_gl, cogs_gl, discount_gl and tax_gl are required for MATERIAL assignment';
  end if;

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

  -- MATERIAL rows must not carry party fields
  if new.party_type is not null or new.party_group is not null or new.control_gl_id is not null then
    raise exception 'MATERIAL assignment must not include party mapping columns';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_gl_assignment_types on public.gl_assignments;
create trigger trg_validate_gl_assignment_types
before insert or update on public.gl_assignments
for each row execute function public.validate_gl_assignment_types();

-- =====================================================================
-- 3) Seed default customer-group GLs + PARTY_GROUP mapping for one SoB
-- =====================================================================
create or replace function public.seed_customer_group_gl_defaults(
  p_organization_id text,
  p_set_of_books_id uuid
)
returns void
language plpgsql
as $$
declare
  v_gl_id uuid;
begin
  -- Create/update required customer-group control GLs
  insert into public.gl_master (
    organization_id,
    set_of_books_id,
    gl_code,
    gl_name,
    gl_type,
    account_group,
    subgroup,
    posting_allowed,
    control_account,
    active_status,
    seeded_by_system,
    template_version,
    created_by,
    updated_by
  )
  values
    (p_organization_id, p_set_of_books_id, '110001', 'Sundry Debtors A/c', 'Asset', 'Current Assets', 'Trade Receivables', false, true, 'Active', true, 'v2.3', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110005', 'Cash Customer Receivable A/c', 'Asset', 'Current Assets', 'Trade Receivables', false, true, 'Active', true, 'v2.3', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110002', 'Corporate Customer Receivable A/c', 'Asset', 'Current Assets', 'Trade Receivables', false, true, 'Active', true, 'v2.3', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110003', 'Retail Customer Receivable A/c', 'Asset', 'Current Assets', 'Trade Receivables', false, true, 'Active', true, 'v2.3', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110004', 'Government Customer Receivable A/c', 'Asset', 'Current Assets', 'Trade Receivables', false, true, 'Active', true, 'v2.3', 'system', 'system')
  on conflict (organization_id, set_of_books_id, gl_code) do update
  set gl_name = excluded.gl_name,
      gl_type = excluded.gl_type,
      account_group = excluded.account_group,
      subgroup = excluded.subgroup,
      posting_allowed = excluded.posting_allowed,
      control_account = excluded.control_account,
      active_status = 'Active',
      seeded_by_system = true,
      template_version = excluded.template_version,
      updated_at = now(),
      updated_by = 'system';

  -- Upsert one-to-one Customer Group -> GL mapping rows (PARTY_GROUP)
  select id into v_gl_id from public.gl_master
  where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110001';

  insert into public.gl_assignments (
    organization_id, set_of_books_id, assignment_scope,
    party_type, party_group, control_gl_id,
    seeded_by_system, template_version, created_by, updated_by
  )
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Sundry Debtors', v_gl_id, true, 'v2.3', 'system', 'system')
  on conflict (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP'
  do update set control_gl_id = excluded.control_gl_id,
                seeded_by_system = true,
                template_version = excluded.template_version,
                updated_at = now(),
                updated_by = 'system';

  select id into v_gl_id from public.gl_master
  where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110005';

  insert into public.gl_assignments (
    organization_id, set_of_books_id, assignment_scope,
    party_type, party_group, control_gl_id,
    seeded_by_system, template_version, created_by, updated_by
  )
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Cash Customers', v_gl_id, true, 'v2.3', 'system', 'system')
  on conflict (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP'
  do update set control_gl_id = excluded.control_gl_id,
                seeded_by_system = true,
                template_version = excluded.template_version,
                updated_at = now(),
                updated_by = 'system';

  select id into v_gl_id from public.gl_master
  where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110002';

  insert into public.gl_assignments (
    organization_id, set_of_books_id, assignment_scope,
    party_type, party_group, control_gl_id,
    seeded_by_system, template_version, created_by, updated_by
  )
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Corporate Customers', v_gl_id, true, 'v2.3', 'system', 'system')
  on conflict (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP'
  do update set control_gl_id = excluded.control_gl_id,
                seeded_by_system = true,
                template_version = excluded.template_version,
                updated_at = now(),
                updated_by = 'system';

  select id into v_gl_id from public.gl_master
  where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110003';

  insert into public.gl_assignments (
    organization_id, set_of_books_id, assignment_scope,
    party_type, party_group, control_gl_id,
    seeded_by_system, template_version, created_by, updated_by
  )
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Retail Customers', v_gl_id, true, 'v2.3', 'system', 'system')
  on conflict (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP'
  do update set control_gl_id = excluded.control_gl_id,
                seeded_by_system = true,
                template_version = excluded.template_version,
                updated_at = now(),
                updated_by = 'system';

  select id into v_gl_id from public.gl_master
  where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110004';

  insert into public.gl_assignments (
    organization_id, set_of_books_id, assignment_scope,
    party_type, party_group, control_gl_id,
    seeded_by_system, template_version, created_by, updated_by
  )
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Government Customers', v_gl_id, true, 'v2.3', 'system', 'system')
  on conflict (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP'
  do update set control_gl_id = excluded.control_gl_id,
                seeded_by_system = true,
                template_version = excluded.template_version,
                updated_at = now(),
                updated_by = 'system';

  -- Keep SoB default customer GL pointer aligned to Sundry Debtors GL (110001)
  update public.set_of_books b
  set default_customer_gl_id = (
        select g.id
        from public.gl_master g
        where g.organization_id = p_organization_id
          and g.set_of_books_id = p_set_of_books_id
          and g.gl_code = '110001'
      ),
      updated_at = now(),
      updated_by = 'system'
  where b.organization_id = p_organization_id
    and b.id = p_set_of_books_id;
end;
$$;

-- =====================================================================
-- 4) Auto-seed defaults on set_of_books insert/update
-- =====================================================================
create or replace function public.trg_seed_customer_group_gl_defaults()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_customer_group_gl_defaults(new.organization_id, new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_customer_group_gl_defaults on public.set_of_books;
create trigger trg_seed_customer_group_gl_defaults
after insert or update on public.set_of_books
for each row execute function public.trg_seed_customer_group_gl_defaults();

-- =====================================================================
-- 5) Auto-assign customer control_gl_id using Customer Group mapping
-- =====================================================================
create or replace function public.auto_assign_customer_group_gl()
returns trigger
language plpgsql
as $$
declare
  v_group text;
  v_sob_id uuid;
  v_control_gl uuid;
begin
  v_group := coalesce(nullif(btrim(new.customer_group), ''), 'Sundry Debtors');
  new.customer_group := v_group;

  -- resolve latest active SoB for organization
  select b.id into v_sob_id
  from public.set_of_books b
  where b.organization_id = new.organization_id
    and b.active_status = 'Active'
  order by b.created_at desc
  limit 1;

  if v_sob_id is null then
    raise exception 'No active Set of Books found for organization %', new.organization_id;
  end if;

  -- mapped Customer Group GL
  select a.control_gl_id into v_control_gl
  from public.gl_assignments a
  where a.organization_id = new.organization_id
    and a.set_of_books_id = v_sob_id
    and a.assignment_scope = 'PARTY_GROUP'
    and a.party_type = 'Customer'
    and a.party_group = v_group
  limit 1;

  -- fallback to SoB default customer GL
  if v_control_gl is null then
    select b.default_customer_gl_id into v_control_gl
    from public.set_of_books b
    where b.id = v_sob_id;
  end if;

  if v_control_gl is null then
    raise exception 'Missing GL mapping for Customer Group "%"', v_group;
  end if;

  -- do not allow manual override if mapped value exists
  if new.control_gl_id is not null and new.control_gl_id <> v_control_gl then
    raise exception 'Control GL is auto-assigned from Customer Group and cannot be manually overridden';
  end if;

  new.control_gl_id := v_control_gl;
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_customer_group_gl on public.customers;
create trigger trg_auto_assign_customer_group_gl
before insert or update on public.customers
for each row execute function public.auto_assign_customer_group_gl();

-- =====================================================================
-- 6) Backfill for existing organizations/books/customers
-- =====================================================================
do $$
declare
  r record;
begin
  for r in
    select b.organization_id, b.id as set_of_books_id
    from public.set_of_books b
    where b.active_status = 'Active'
  loop
    perform public.seed_customer_group_gl_defaults(r.organization_id, r.set_of_books_id);
  end loop;

  -- touch customers to trigger auto map
  update public.customers
     set customer_group = coalesce(nullif(btrim(customer_group), ''), 'Sundry Debtors')
   where true;
end
$$;

commit;

-- refresh PostgREST schema cache
notify pgrst, 'reload schema';
