-- Default company + default set-of-books hardening migration (runnable SQL).
-- Execute this file as-is in Supabase SQL editor.

begin;

alter table if exists public.company_codes
  add column if not exists is_default boolean not null default false;

alter table if exists public.company_codes
  add column if not exists default_set_of_books_id text;

create unique index if not exists uq_company_codes_one_default_per_org
  on public.company_codes(organization_id)
  where is_default = true;

create unique index if not exists uq_set_of_books_company_and_code
  on public.set_of_books(company_code_id, set_of_books_id);

alter table if exists public.company_codes
  drop constraint if exists fk_company_codes_default_set_of_books;

alter table if exists public.company_codes
  add constraint fk_company_codes_default_set_of_books
  foreign key (id, default_set_of_books_id) references public.set_of_books(company_code_id, set_of_books_id) on update cascade;

create or replace function public.validate_default_company_mapping()
returns trigger
language plpgsql
as $$
declare
  mapped_company_id uuid;
  mapped_org_id text;
begin
  if new.is_default and coalesce(new.status, 'Active') <> 'Active' then
    raise exception 'Inactive company cannot be selected as default company.';
  end if;

  if new.is_default and new.default_set_of_books_id is null then
    raise exception 'Default Company must always have a Default Set of Books assigned.';
  end if;

  if new.default_set_of_books_id is not null then
    select company_code_id, organization_id into mapped_company_id, mapped_org_id
    from public.set_of_books
    where company_code_id = new.id and set_of_books_id = new.default_set_of_books_id;

    if mapped_company_id is null then
      raise exception 'Default Set of Books is invalid.';
    end if;

    if mapped_company_id <> new.id then
      raise exception 'Default Set of Books must belong to the selected Default Company.';
    end if;

    if mapped_org_id is null or mapped_org_id <> new.organization_id then
      raise exception 'Default Set of Books must belong to the same organization.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_default_company_mapping on public.company_codes;
create trigger trg_validate_default_company_mapping
before insert or update on public.company_codes
for each row
execute function public.validate_default_company_mapping();

create or replace function public.sync_company_default_set_of_books_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.company_codes c
       set default_set_of_books_id = new.set_of_books_id
     where c.id = new.company_code_id
       and c.is_default = true
       and c.default_set_of_books_id is null;
    return new;
  end if;

  if old.set_of_books_id is distinct from new.set_of_books_id then
    update public.company_codes c
       set default_set_of_books_id = new.set_of_books_id
     where c.id = new.company_code_id
       and c.default_set_of_books_id = old.set_of_books_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_company_default_set_of_books_id on public.set_of_books;
create trigger trg_sync_company_default_set_of_books_id
after insert or update on public.set_of_books
for each row
execute function public.sync_company_default_set_of_books_id();

commit;

notify pgrst, 'reload schema';
