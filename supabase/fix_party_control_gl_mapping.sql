-- Migration: Transition to GL Code-based mapping for Suppliers and Customers
-- Implements proper ERP design by storing GL Code and Name in master records.

begin;

-- 1. Add columns to store GL Code and Name for master records
alter table if exists public.suppliers
  add column if not exists control_gl_code text,
  add column if not exists control_gl_name text;

alter table if exists public.customers
  add column if not exists control_gl_code text,
  add column if not exists control_gl_name text;

-- 2. Clean up duplicate mappings in gl_assignments if any exist
-- We keep only the latest entry per group
with duplicates as (
  select id, row_number() over (
    partition by organization_id, set_of_books_id, party_type, party_group 
    order by created_at desc
  ) as rn
  from public.gl_assignments
  where assignment_scope = 'PARTY_GROUP'
)
delete from public.gl_assignments
where id in (select id from duplicates where rn > 1);

-- 3. Enforce uniqueness on gl_assignments
drop index if exists uq_gl_assignments_party;
create unique index uq_gl_assignments_party
  on public.gl_assignments (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP';

-- 4. Create a temporary "lenient" version of the trigger for backfilling
create or replace function public.auto_map_party_control_gl()
returns trigger
language plpgsql
as $$
declare
  v_group text;
  v_party_type text;
  v_sob_id uuid;
  v_control_gl uuid;
  v_gl_code text;
  v_gl_name text;
begin
  if tg_table_name = 'customers' then
    v_party_type := 'Customer';
    v_group := coalesce(nullif(btrim(new.customer_group), ''), 'Sundry Debtors');
    new.customer_group := v_group;
  else
    v_party_type := 'Supplier';
    v_group := coalesce(nullif(btrim(new.supplier_group), ''), 'Sundry Creditors');
    new.supplier_group := v_group;
  end if;

  -- Resolve active set of books for organization (latest active).
  select b.id into v_sob_id
  from public.set_of_books b
  where b.organization_id = new.organization_id
    and b.active_status = 'Active'
  order by b.created_at desc
  limit 1;

  if v_sob_id is not null then
    -- Join with gl_master to get Code and Name
    select 
      a.control_gl_id,
      g.gl_code,
      g.gl_name
    into 
      v_control_gl,
      v_gl_code,
      v_gl_name
    from public.gl_assignments a
    join public.gl_master g on g.id = a.control_gl_id
    where a.organization_id = new.organization_id
      and a.set_of_books_id = v_sob_id
      and a.assignment_scope = 'PARTY_GROUP'
      and a.party_type = v_party_type
      and a.party_group = v_group
    limit 1;

    if v_control_gl is not null then
      new.control_gl_id := v_control_gl;
      new.control_gl_code := v_gl_code;
      new.control_gl_name := v_gl_name;
    end if;
  end if;
  
  return new;
end;
$$;

-- 5. Backfill existing records (Trigger will now be silent or help populate)
update public.suppliers s
set control_gl_code = sub.gl_code,
    control_gl_name = sub.gl_name
from (
    select 
      a.organization_id,
      a.party_group,
      g.gl_code,
      g.gl_name
    from public.gl_assignments a
    join public.gl_master g on g.id = a.control_gl_id
    where a.assignment_scope = 'PARTY_GROUP' 
      and a.party_type = 'Supplier'
) sub
where s.organization_id = sub.organization_id
  and s.supplier_group = sub.party_group
  and s.control_gl_code is null;

update public.customers c
set control_gl_code = sub.gl_code,
    control_gl_name = sub.gl_name
from (
    select 
      a.organization_id,
      a.party_group,
      g.gl_code,
      g.gl_name
    from public.gl_assignments a
    join public.gl_master g on g.id = a.control_gl_id
    where a.assignment_scope = 'PARTY_GROUP' 
      and a.party_type = 'Customer'
) sub
where c.organization_id = sub.organization_id
  and c.customer_group = sub.party_group
  and c.control_gl_code is null;

-- 6. NOW apply the STRICT version of the trigger for future data entry
create or replace function public.auto_map_party_control_gl()
returns trigger
language plpgsql
as $$
declare
  v_group text;
  v_party_type text;
  v_sob_id uuid;
  v_control_gl uuid;
  v_gl_code text;
  v_gl_name text;
begin
  if tg_table_name = 'customers' then
    v_party_type := 'Customer';
    v_group := coalesce(nullif(btrim(new.customer_group), ''), 'Sundry Debtors');
    new.customer_group := v_group;
  else
    v_party_type := 'Supplier';
    v_group := coalesce(nullif(btrim(new.supplier_group), ''), 'Sundry Creditors');
    new.supplier_group := v_group;
  end if;

  -- Resolve active set of books for organization (latest active).
  select b.id into v_sob_id
  from public.set_of_books b
  where b.organization_id = new.organization_id
    and b.active_status = 'Active'
  order by b.created_at desc
  limit 1;

  if v_sob_id is null then
    raise exception 'Configuration error: No active Set of Books found for organization %', new.organization_id;
  end if;

  -- Join with gl_master to get Code and Name
  select 
    a.control_gl_id,
    g.gl_code,
    g.gl_name
  into 
    v_control_gl,
    v_gl_code,
    v_gl_name
  from public.gl_assignments a
  join public.gl_master g on g.id = a.control_gl_id
  where a.organization_id = new.organization_id
    and a.set_of_books_id = v_sob_id
    and a.assignment_scope = 'PARTY_GROUP'
    and a.party_type = v_party_type
    and a.party_group = v_group
  limit 1;

  if v_control_gl is null then
    raise exception 'Configuration error: Missing GL mapping for % group "%"', v_party_type, v_group;
  end if;

  -- Lock manual edit: if caller tries forcing a different GL, reject.
  if new.control_gl_id is not null and new.control_gl_id <> v_control_gl then
    raise exception 'Control GL is auto-mapped from group and cannot be manually edited';
  end if;

  new.control_gl_id := v_control_gl;
  new.control_gl_code := v_gl_code;
  new.control_gl_name := v_gl_name;
  
  return new;
end;
$$;

commit;

-- Refresh PostgREST cache
notify pgrst, 'reload schema';
