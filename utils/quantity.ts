const formatQtyValue = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};

export const formatPackLooseQuantity = (
  packQty?: number | null,
  looseQty?: number | null
): string => {
  const packs = Number(packQty || 0);
  const loose = Number(looseQty || 0);

  if (packs > 0 && loose > 0) {
    return `${formatQtyValue(packs)}(P) + ${formatQtyValue(loose)}(L)`;
  }
  if (packs > 0) {
    return `${formatQtyValue(packs)}(P)`;
  }
  if (loose > 0) {
    return `${formatQtyValue(loose)}(L)`;
  }
  return '0';
};
