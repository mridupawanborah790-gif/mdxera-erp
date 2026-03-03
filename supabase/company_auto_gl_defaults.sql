-- Auto-seed control GLs and party group mappings for Company Configuration.
-- Implements:
-- 1) default GL auto creation on Set of Books save
-- 2) supplier/customer group -> control GL mapping in gl_assignments
-- 3) auto-mapping of customers/suppliers control GL at save time
-- 4) safety controls for duplicate/missing/invalid control GL

-- Extend gl_assignments so one table can support both material and party-group mappings.
alter table if exists public.gl_assignments
  add column if not exists assignment_scope text not null default 'MATERIAL'
    check (assignment_scope in ('MATERIAL', 'PARTY_GROUP')),
  add column if not exists party_type text
    check (party_type in ('Customer', 'Supplier')),
  add column if not exists party_group text,
  add column if not exists control_gl_id uuid references public.gl_master(id) on delete restrict;

alter table if exists public.gl_assignments
  alter column purchase_gl drop not null,
  alter column cogs_gl drop not null,
  alter column discount_gl drop not null,
  alter column tax_gl drop not null;

-- Scope-safe uniqueness constraints.
create unique index if not exists uq_gl_assignments_material
  on public.gl_assignments (organization_id, set_of_books_id, material_master_type)
  where assignment_scope = 'MATERIAL';

create unique index if not exists uq_gl_assignments_party
  on public.gl_assignments (organization_id, set_of_books_id, party_type, party_group)
  where assignment_scope = 'PARTY_GROUP';

create index if not exists idx_gl_assignments_party_lookup
  on public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group);

-- Validation for MATERIAL and PARTY_GROUP rows.
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

    select g.gl_type, g.posting_allowed into ctrl_type, ctrl_posting_allowed
    from public.gl_master g
    where g.id = new.control_gl_id;

    if ctrl_type is null then
      raise exception 'control_gl_id does not exist in gl_master';
    end if;

    if new.party_type = 'Customer' and ctrl_type is distinct from 'Asset' then
      raise exception 'Customer control GL must be Asset';
    end if;

    if new.party_type = 'Supplier' and ctrl_type is distinct from 'Liability' then
      raise exception 'Supplier control GL must be Liability';
    end if;

    if ctrl_posting_allowed then
      raise exception 'Control GL cannot be transaction GL (posting_allowed must be false)';
    end if;

    -- Material columns must stay empty for party mappings.
    if new.material_master_type is not null
      or new.inventory_gl is not null
      or new.purchase_gl is not null
      or new.cogs_gl is not null
      or new.sales_gl is not null
      or new.discount_gl is not null
      or new.tax_gl is not null then
      raise exception 'PARTY_GROUP assignment must not include material GL columns';
    end if;

    return new;
  end if;

  -- MATERIAL validation (existing behavior)
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

  -- Party columns must stay empty for material mappings.
  if new.party_type is not null or new.party_group is not null or new.control_gl_id is not null then
    raise exception 'MATERIAL assignment must not include party mapping columns';
  end if;

  return new;
end;
$$;

-- Seeds required default control GLs + party group mappings for one set_of_books.
create or replace function public.seed_party_control_defaults(p_organization_id text, p_set_of_books_id uuid)
returns void
language plpgsql
as $$
declare
  v_gl_id uuid;
begin
  -- Supplier side
  insert into public.gl_master (organization_id, set_of_books_id, gl_code, gl_name, gl_type, posting_allowed, control_account, active_status, seeded_by_system, template_version, created_by, updated_by)
  values
    (p_organization_id, p_set_of_books_id, '210001', 'Sundry Creditors – Trade', 'Liability', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '210002', 'Import Creditors / Foreign Vendors', 'Liability', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '210003', 'Local Trade Creditors', 'Liability', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '210004', 'Service Creditors Control', 'Liability', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '610001', 'Service Expense Account', 'Expense', true, false, 'Active', true, 'v2.0', 'system', 'system'),

    -- Customer side
    (p_organization_id, p_set_of_books_id, '110001', 'Sundry Debtors – Trade Receivables', 'Asset', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110002', 'Corporate Trade Receivables', 'Asset', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110003', 'Retail Trade Receivables', 'Asset', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '110004', 'Government Receivables', 'Asset', false, true, 'Active', true, 'v2.0', 'system', 'system'),
    (p_organization_id, p_set_of_books_id, '100001', 'Cash on Hand / POS Cash Account', 'Asset', true, false, 'Active', true, 'v2.0', 'system', 'system')
  on conflict (organization_id, set_of_books_id, gl_code) do nothing;

  -- Mapping helper macro-style block
  -- Supplier mappings
  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '210001';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 210001'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Supplier', 'Sundry Creditors', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '210002';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 210002'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Supplier', 'Import Vendors', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '210004';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 210004'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Supplier', 'Service Vendors', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '210003';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 210003'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Supplier', 'Local Vendors', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  -- Customer mappings
  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110001';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 110001'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Sundry Debtors', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '100001';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 100001'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Cash Customers', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110002';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 110002'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Corporate Customers', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110003';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 110003'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Retail Customers', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  select id into v_gl_id from public.gl_master where organization_id = p_organization_id and set_of_books_id = p_set_of_books_id and gl_code = '110004';
  if v_gl_id is null then raise exception 'Configuration error: Missing GL 110004'; end if;
  insert into public.gl_assignments (organization_id, set_of_books_id, assignment_scope, party_type, party_group, control_gl_id, seeded_by_system, template_version, created_by, updated_by)
  values (p_organization_id, p_set_of_books_id, 'PARTY_GROUP', 'Customer', 'Government Customers', v_gl_id, true, 'v2.0', 'system', 'system')
  on conflict do nothing;

  -- Keep default control GL pointers in set_of_books aligned.
  update public.set_of_books b
  set
    default_customer_gl_id = (select g.id from public.gl_master g where g.organization_id = p_organization_id and g.set_of_books_id = p_set_of_books_id and g.gl_code = '110001'),
    default_supplier_gl_id = (select g.id from public.gl_master g where g.organization_id = p_organization_id and g.set_of_books_id = p_set_of_books_id and g.gl_code = '210001'),
    updated_at = now(),
    updated_by = 'system'
  where b.id = p_set_of_books_id
    and b.organization_id = p_organization_id;
end;
$$;

-- Ensure auto-seed happens on set_of_books create/update ("Company Configuration Save" safety check).
create or replace function public.auto_seed_party_control_defaults_on_books()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_party_control_defaults(new.organization_id, new.id);
  return new;
end;
$$;

drop trigger if exists trg_auto_seed_party_control_defaults_on_books on public.set_of_books;
create trigger trg_auto_seed_party_control_defaults_on_books
after insert or update on public.set_of_books
for each row
execute function public.auto_seed_party_control_defaults_on_books();

-- Customer/Supplier: read group -> fetch mapped GL from gl_assignments -> store control_gl_id.
create or replace function public.auto_map_party_control_gl()
returns trigger
language plpgsql
as $$
declare
  v_group text;
  v_party_type text;
  v_sob_id uuid;
  v_control_gl uuid;
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

  select a.control_gl_id into v_control_gl
  from public.gl_assignments a
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
  return new;
end;
$$;

drop trigger if exists trg_auto_map_customer_control_gl on public.customers;
create trigger trg_auto_map_customer_control_gl
before insert or update on public.customers
for each row execute function public.auto_map_party_control_gl();

drop trigger if exists trg_auto_map_supplier_control_gl on public.suppliers;
create trigger trg_auto_map_supplier_control_gl
before insert or update on public.suppliers
for each row execute function public.auto_map_party_control_gl();

-- Backfill existing active books once, so existing orgs also get defaults.
do $$
declare
  r record;
begin
  for r in
    select b.organization_id, b.id as set_of_books_id
    from public.set_of_books b
    where b.active_status = 'Active'
  loop
    perform public.seed_party_control_defaults(r.organization_id, r.set_of_books_id);
  end loop;
end
$$;
