-- Enforce unique barcode values in Material Master (ignoring blank values)
create unique index if not exists material_master_barcode_unique_idx
on public.material_master (organization_id, lower(trim(barcode)))
where barcode is not null and trim(barcode) <> '';
