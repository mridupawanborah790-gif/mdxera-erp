const formatQtyValue = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};

export const formatPackLooseQuantity = (
  packQty?: number | null,
  looseQty?: number | null,
  freeQty?: number | null
): string => {
  const qty = Number(packQty ?? 0);
  const loose = Number(looseQty ?? 0);
  const free = Number(freeQty ?? 0);

  if (loose > 0) {
    return `${formatQtyValue(qty)}:${formatQtyValue(loose)}`;
  }
  if (free > 0) {
    return `${formatQtyValue(qty)}+${formatQtyValue(free)}`;
  }
  return formatQtyValue(qty);
};
