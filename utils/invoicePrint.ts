import type { BillItem, InventoryItem, Medicine } from '../types';

export type InvoicePrintItem = BillItem & {
  materialMasterType?: Medicine['materialMasterType'] | string;
  material_master_type?: string;
  isInventorised?: boolean;
  inventorised?: boolean;
  materialMasterPack?: string;
  pack?: string;
  batch_pack?: string;
};

export const isServiceMaterialInvoiceItem = (item: Partial<InvoicePrintItem>): boolean => {
  const normalizedType = String(item.materialMasterType || item.material_master_type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return normalizedType === 'service_material' || item.inventorised === false || item.isInventorised === false;
};

const normalizePack = (value: unknown): string => String(value ?? '').trim();

export const resolveInvoiceDisplayPack = (
  item: Partial<InvoicePrintItem>,
  inventoryItem?: Partial<InventoryItem> | null,
): string => {
  if (isServiceMaterialInvoiceItem(item)) {
    return normalizePack(item.pack ?? item.materialMasterPack);
  }

  return (
    normalizePack(item.pack ?? item.materialMasterPack) ||
    normalizePack(item.packType) ||
    normalizePack(item.batch_pack) ||
    normalizePack(inventoryItem?.packType) ||
    normalizePack(item.unitOfMeasurement ?? inventoryItem?.unitOfMeasurement)
  );
};

export const resolveInvoiceDisplayName = (
  item: Partial<InvoicePrintItem>,
  inventoryItem?: Partial<InventoryItem> | null,
): string => {
  const name = String(item.name || '').trim();
  const pack = resolveInvoiceDisplayPack(item, inventoryItem);
  return pack ? `${name} (${pack})` : name;
};
