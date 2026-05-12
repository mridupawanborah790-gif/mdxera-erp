ALTER TABLE public.material_master
ADD COLUMN IF NOT EXISTS valuation_method text NOT NULL DEFAULT 'moving_average' CHECK (valuation_method IN ('standard', 'moving_average')),
ADD COLUMN IF NOT EXISTS standard_valuation_price numeric(14,4) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS valuation_price numeric(14,4) NOT NULL DEFAULT 0;
