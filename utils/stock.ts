import { resolveUnitsPerStrip } from './pack';

export interface StockBreakup {
  pack: number;
  loose: number;
  totalUnits: number;
  unitsPerPack: number;
}

export const normalizeUnitsPerPack = (unitsPerPack?: number, packType?: string | null) => resolveUnitsPerStrip(unitsPerPack, packType);

export const getStockBreakup = (totalUnits: number, unitsPerPack?: number, packType?: string | null): StockBreakup => {
  const upp = normalizeUnitsPerPack(unitsPerPack, packType);
  const safeTotal = Math.max(0, Math.floor(Number(totalUnits || 0)));
  return {
    pack: Math.floor(safeTotal / upp),
    loose: safeTotal % upp,
    totalUnits: safeTotal,
    unitsPerPack: upp,
  };
};

export const buildTotalStockFromBreakup = (
  packUnits: number,
  looseUnits: number,
  unitsPerPack?: number,
  allowLoose = true,
  packType?: string | null,
): number => {
  const upp = normalizeUnitsPerPack(unitsPerPack, packType);
  const safePacks = Math.max(0, Math.floor(Number(packUnits || 0)));
  const requestedLoose = allowLoose ? Math.max(0, Math.floor(Number(looseUnits || 0))) : 0;
  const safeLoose = allowLoose ? Math.min(requestedLoose, upp - 1) : 0;
  return (safePacks * upp) + safeLoose;
};

export const deductStockLooseFirst = (
  totalUnits: number,
  unitsToDeduct: number,
  unitsPerPack?: number,
  packType?: string | null,
): number => {
  const upp = normalizeUnitsPerPack(unitsPerPack, packType);
  const currentTotal = Math.max(0, Math.floor(Number(totalUnits || 0)));
  const neededUnits = Math.max(0, Math.floor(Number(unitsToDeduct || 0)));

  const availableLoose = currentTotal % upp;
  const looseDeducted = Math.min(availableLoose, neededUnits);
  const remainingAfterLoose = neededUnits - looseDeducted;

  const totalAfterLoose = currentTotal - looseDeducted;
  const finalTotal = totalAfterLoose - remainingAfterLoose;

  return Math.max(0, finalTotal);
};
