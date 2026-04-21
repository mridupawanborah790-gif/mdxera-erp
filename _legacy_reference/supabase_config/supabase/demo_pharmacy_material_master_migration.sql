-- Demo pharmacy material master migration support

ALTER TABLE IF EXISTS public.material_master
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS migration_job_id text,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS created_by_id text,
  ADD COLUMN IF NOT EXISTS source_uom text,
  ADD COLUMN IF NOT EXISTS purchase_rate numeric,
  ADD COLUMN IF NOT EXISTS sale_rate numeric,
  ADD COLUMN IF NOT EXISTS item_type text;

CREATE TABLE IF NOT EXISTS public.material_master_all (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    industry text NOT NULL,
    is_demo boolean NOT NULL DEFAULT false,
    business_type text NOT NULL,
    material_name text NOT NULL,
    item_code text,
    sku text,
    barcode text,
    pack text,
    uom text,
    hsn text,
    gst_rate numeric,
    category text,
    manufacturer text,
    mrp numeric,
    purchase_rate numeric,
    sale_rate numeric,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_master_all_demo_filter
    ON public.material_master_all (industry, is_demo, business_type);

CREATE TABLE IF NOT EXISTS public.demo_migration_jobs (
    job_id text PRIMARY KEY,
    job_type text NOT NULL,
    source_table text NOT NULL,
    target_table text NOT NULL,
    target_org_id text NOT NULL,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    inserted_count integer NOT NULL DEFAULT 0,
    skipped_count integer NOT NULL DEFAULT 0,
    updated_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'COMPLETED'
);

CREATE TABLE IF NOT EXISTS public.demo_migration_job_items (
    id bigserial PRIMARY KEY,
    job_id text NOT NULL REFERENCES public.demo_migration_jobs(job_id) ON DELETE CASCADE,
    source_row_id text NOT NULL,
    target_material_id text,
    action text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_migration_jobs_org ON public.demo_migration_jobs (target_org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_migration_job_items_job ON public.demo_migration_job_items (job_id);
