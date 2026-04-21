-- Single source hardening for Pack/GST/MRP/HSN
-- Material Master remains the persistence authority.

-- 1) Backfill inventory display columns from material master so existing rows become consistent.
update inventory i
set
  pack_type = coalesce(nullif(trim(mm.pack), ''), i.pack_type),
  units_per_pack = case
    when coalesce(nullif(trim(mm.pack), ''), '') ~ '^\s*\d+'
      then greatest(1, regexp_replace(mm.pack, '^\s*(\d+).*$','\1')::int)
    else i.units_per_pack
  end,
  gst_percent = coalesce(mm.gst_rate, i.gst_percent),
  mrp = coalesce(nullif(mm.mrp, '')::numeric, i.mrp),
  hsn_code = coalesce(nullif(trim(mm.hsn_code), ''), i.hsn_code),
  updated_at = now()
from material_master mm
where i.organization_id = mm.organization_id
  and lower(trim(i.code)) = lower(trim(mm.material_code));

-- 2) Keep inventory as editable UI by syncing its edits back to material_master.
create or replace function sync_material_master_from_inventory()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.code, '') = '' then
    return new;
  end if;

  update material_master mm
  set
    pack = coalesce(nullif(trim(new.pack_type), ''), mm.pack),
    gst_rate = coalesce(new.gst_percent, mm.gst_rate),
    mrp = coalesce(new.mrp::text, mm.mrp),
    hsn_code = coalesce(nullif(trim(new.hsn_code), ''), mm.hsn_code),
    updated_at = now()
  where mm.organization_id = new.organization_id
    and lower(trim(mm.material_code)) = lower(trim(new.code));

  return new;
end;
$$;

drop trigger if exists trg_inventory_sync_material_master on inventory;
create trigger trg_inventory_sync_material_master
after insert or update of pack_type, gst_percent, mrp, hsn_code, code
on inventory
for each row
execute function sync_material_master_from_inventory();
