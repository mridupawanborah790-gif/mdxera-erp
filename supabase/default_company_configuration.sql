-- Default Company + Default Set of Books controls
-- IMPORTANT:
--   Run this file content directly in SQL editor.
--   Do NOT paste git diff text (lines starting with @@, +, -), which causes syntax error 42601.

begin;

alter table if exists public.company_codes
  add column if not exists is_default boolean not null default false,
  add column if not exists default_set_of_books_id uuid;

create unique index if not exists uq_company_codes_one_default_per_org
  on public.company_codes(organization_id)
  where is_default = true;

alter table if exists public.company_codes
  drop constraint if exists fk_company_codes_default_set_of_books;

alter table if exists public.company_codes
  add constraint fk_company_codes_default_set_of_books
  foreign key (default_set_of_books_id) references public.set_of_books(id) on delete set null;

create or replace function public.validate_default_company_mapping()
returns trigger
language plpgsql
as $$
declare
  mapped_company_id uuid;
begin
  if new.is_default and new.default_set_of_books_id is null then
    raise exception 'Default Company must always have a Default Set of Books assigned.';
  end if;

  if new.default_set_of_books_id is not null then
    select company_code_id into mapped_company_id
    from public.set_of_books
    where id = new.default_set_of_books_id;

    if mapped_company_id is null or mapped_company_id <> new.id then
      raise exception 'Default Set of Books must belong to the selected Default Company.';
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

commit;

notify pgrst, 'reload schema';
