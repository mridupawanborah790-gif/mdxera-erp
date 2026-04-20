-- MBC Card Management module schema

create table if not exists public.mbc_card_types (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.registered_pharmacies(organization_id) on delete cascade,
    type_name text not null,
    type_code text not null,
    description text,
    default_validity_value integer not null default 1,
    default_validity_unit text not null default 'years' check (default_validity_unit in ('days','months','years')),
    default_card_value numeric(12,2) not null default 0,
    template_id uuid,
    color_theme text,
    prefix text not null default 'MBC',
    auto_numbering boolean not null default true,
    allow_manual_value_edit boolean not null default false,
    allow_renewal boolean not null default true,
    allow_upgrade boolean not null default true,
    benefits text,
    terms_conditions text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, type_name),
    unique (organization_id, type_code)
);

create table if not exists public.mbc_card_templates (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.registered_pharmacies(organization_id) on delete cascade,
    template_name text not null,
    template_code text not null,
    card_type_id uuid references public.mbc_card_types(id) on delete set null,
    width numeric(8,2) not null default 86,
    height numeric(8,2) not null default 54,
    orientation text not null default 'landscape',
    background_image text,
    logo_image text,
    template_json jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, template_name),
    unique (organization_id, template_code)
);

alter table public.mbc_card_types
    add constraint if not exists mbc_card_types_template_fk
    foreign key (template_id) references public.mbc_card_templates(id) on delete set null;

create table if not exists public.mbc_cards (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.registered_pharmacies(organization_id) on delete cascade,
    card_number text not null,
    customer_name text not null,
    guardian_name text,
    date_of_birth date,
    gender text,
    address_line_1 text,
    address_line_2 text,
    city text,
    district text,
    state text,
    pin_code text,
    phone_number text not null,
    alternate_phone text,
    email text,
    card_type_id uuid not null references public.mbc_card_types(id) on delete restrict,
    template_id uuid references public.mbc_card_templates(id) on delete set null,
    issue_date date not null,
    validity_from date not null,
    validity_to date not null,
    validity_period_text text,
    card_value numeric(12,2) not null default 0,
    qr_value text,
    barcode_value text,
    remarks text,
    status text not null default 'active' check (status in ('active','inactive','expired','upcoming')),
    created_by text,
    photo_url text,
    whatsapp_number text,
    website_link text,
    office_location_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, card_number)
);

create table if not exists public.mbc_card_history (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.registered_pharmacies(organization_id) on delete cascade,
    mbc_card_id uuid not null references public.mbc_cards(id) on delete cascade,
    action_type text not null check (action_type in ('create','update','renew','upgrade','deactivate')),
    old_card_type_id uuid references public.mbc_card_types(id) on delete set null,
    new_card_type_id uuid references public.mbc_card_types(id) on delete set null,
    old_validity_to date,
    new_validity_to date,
    old_card_value numeric(12,2),
    new_card_value numeric(12,2),
    remarks text,
    action_by text,
    action_date timestamptz not null default now()
);

create index if not exists idx_mbc_cards_org_status on public.mbc_cards (organization_id, status);
create index if not exists idx_mbc_cards_org_validity on public.mbc_cards (organization_id, validity_to);
create index if not exists idx_mbc_history_org_card on public.mbc_card_history (organization_id, mbc_card_id, action_date desc);

alter table public.mbc_card_types enable row level security;
alter table public.mbc_card_templates enable row level security;
alter table public.mbc_cards enable row level security;
alter table public.mbc_card_history enable row level security;

create policy if not exists "mbc_card_types_org_policy" on public.mbc_card_types
    for all using (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()))
    with check (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()));

create policy if not exists "mbc_card_templates_org_policy" on public.mbc_card_templates
    for all using (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()))
    with check (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()));

create policy if not exists "mbc_cards_org_policy" on public.mbc_cards
    for all using (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()))
    with check (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()));

create policy if not exists "mbc_card_history_org_policy" on public.mbc_card_history
    for all using (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()))
    with check (organization_id in (select organization_id from public.registered_pharmacies where user_id = auth.uid()));

create or replace function public.mbc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_mbc_card_types_updated_at on public.mbc_card_types;
create trigger trg_mbc_card_types_updated_at before update on public.mbc_card_types
for each row execute function public.mbc_touch_updated_at();

drop trigger if exists trg_mbc_card_templates_updated_at on public.mbc_card_templates;
create trigger trg_mbc_card_templates_updated_at before update on public.mbc_card_templates
for each row execute function public.mbc_touch_updated_at();

drop trigger if exists trg_mbc_cards_updated_at on public.mbc_cards;
create trigger trg_mbc_cards_updated_at before update on public.mbc_cards
for each row execute function public.mbc_touch_updated_at();
