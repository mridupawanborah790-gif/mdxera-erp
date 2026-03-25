-- Customer credit control fields and constraints
alter table if exists public.customers
  add column if not exists credit_limit numeric(15,2) not null default 0,
  add column if not exists credit_days integer not null default 0,
  add column if not exists credit_status text not null default 'active',
  add column if not exists credit_control_mode text not null default 'hard_block',
  add column if not exists allow_override boolean not null default false,
  add column if not exists override_approval_required boolean not null default false;

alter table if exists public.customers
  drop constraint if exists chk_customers_credit_limit_non_negative;
alter table if exists public.customers
  add constraint chk_customers_credit_limit_non_negative check (credit_limit >= 0);

alter table if exists public.customers
  drop constraint if exists chk_customers_credit_status;
alter table if exists public.customers
  add constraint chk_customers_credit_status check (credit_status in ('active', 'blocked'));

alter table if exists public.customers
  drop constraint if exists chk_customers_credit_control_mode;
alter table if exists public.customers
  add constraint chk_customers_credit_control_mode check (credit_control_mode in ('warning_only', 'hard_block'));
