ALTER TABLE public.material_master
  ADD COLUMN IF NOT EXISTS imei varchar NULL,
  ADD COLUMN IF NOT EXISTS product_discount numeric DEFAULT 0;

UPDATE public.material_master
SET product_discount = 0
WHERE product_discount IS NULL;
