const formatQtyValue = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};

export const formatPackLooseQuantity = (
  packQty?: number | null,
  looseQty?: number | null,
  freeQty?: number | null
): string => {
  const packs = Number(packQty || 0);
  const loose = Number(looseQty || 0);
  const free = Number(freeQty || 0);
  const parts: string[] = [];

  if (packs > 0) {
    parts.push(`${formatQtyValue(packs)}(P)`);
  }
  if (loose > 0) {
    parts.push(`${formatQtyValue(loose)}(L)`);
  }
  if (free > 0) {
    parts.push(`${formatQtyValue(free)}(F)`);
  }

  return parts.length > 0 ? parts.join(' + ') : '0';
};
