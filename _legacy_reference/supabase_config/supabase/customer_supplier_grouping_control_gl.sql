-- Add grouping and control GL mapping for customer/supplier masters

alter table if exists public.customers
  add column if not exists customer_group text not null default 'Sundry Debtors',
  add column if not exists control_gl_id uuid references public.gl_master(id) on delete restrict;

alter table if exists public.suppliers
  add column if not exists supplier_group text not null default 'Sundry Creditors',
  add column if not exists control_gl_id uuid references public.gl_master(id) on delete restrict;

create index if not exists idx_customers_control_gl on public.customers(control_gl_id);
create index if not exists idx_suppliers_control_gl on public.suppliers(control_gl_id);

create or replace function public.validate_party_control_gl()
returns trigger
language plpgsql
as $$
declare
  gl_exists boolean;
  matched_count integer;
begin
  if tg_table_name = 'customers' then
    if new.customer_group is null or btrim(new.customer_group) = '' then
      raise exception 'Customer Group must not be empty';
    end if;
  elsif tg_table_name = 'suppliers' then
    if new.supplier_group is null or btrim(new.supplier_group) = '' then
      raise exception 'Supplier Group must not be empty';
    end if;
  end if;

  if new.control_gl_id is null then
    raise exception 'Control GL must be mapped';
  end if;

  select exists(select 1 from public.gl_master g where g.id = new.control_gl_id and g.organization_id = new.organization_id) into gl_exists;
  if not gl_exists then
    raise exception 'Control GL does not exist for organization';
  end if;

  select count(*) into matched_count
  from public.gl_master g
  join public.set_of_books b on b.id = g.set_of_books_id
  where g.id = new.control_gl_id
    and b.organization_id = new.organization_id
    and b.active_status = 'Active';

  if matched_count = 0 then
    raise exception 'Control GL must exist in active Set of Books';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_customer_control_gl on public.customers;
create trigger trg_validate_customer_control_gl
before insert or update on public.customers
for each row execute function public.validate_party_control_gl();

drop trigger if exists trg_validate_supplier_control_gl on public.suppliers;
create trigger trg_validate_supplier_control_gl
before insert or update on public.suppliers
for each row execute function public.validate_party_control_gl();
