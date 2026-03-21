-- MRP change history log for Inventory and Material Master synchronization
CREATE TABLE IF NOT EXISTS public.mrp_change_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.profiles(organization_id) ON DELETE CASCADE,
    material_code text NOT NULL,
    product_name text NOT NULL,
    old_mrp numeric(12,2) NOT NULL,
    new_mrp numeric(12,2) NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by_id uuid,
    changed_by_name text,
    source_screen text NOT NULL CHECK (source_screen IN ('Inventory', 'Material Master')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mrp_change_log_org_code_date
    ON public.mrp_change_log (organization_id, material_code, changed_at DESC);

ALTER TABLE public.mrp_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access own org mrp log" ON public.mrp_change_log;
CREATE POLICY "Users can access own org mrp log"
ON public.mrp_change_log
FOR ALL
USING (
    organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
)
WITH CHECK (
    organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
);
