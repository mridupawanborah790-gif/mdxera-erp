export const getPackTypeText = (packType?: string | null): string => (packType || '').trim();

// Strip-based examples: 10s, 2'S, 10 TAB, 10 Cap, 15 tablets, 10 strips
const STRIP_PACK_PATTERN = /\b\d+\s*(?:['’]?s|tab(?:let)?(?:['’]s|s)?|cap(?:sule)?s?|strips?)\b/i;
const LIQUID_WEIGHT_PACK_PATTERN = /\b(?:\d+(?:\.\d+)?)\s*(?:ml|millilit(?:er|re)s?|l|ltr|lit(?:er|re)s?|litter|mg|milligram(?:s)?|miligarm|g|gm|gram(?:s)?|kg|kilogram(?:s)?|injection|inj|vial|drop|pack|pac|pcs)\b/i;

const PACK_MULTIPLIER_PATTERN = /\b(\d+)\s*[x×]\s*(\d+)\b/i;

export const isStripBasedPack = (packType?: string | null): boolean => {
  const normalizedPack = getPackTypeText(packType);
  if (!normalizedPack) return false;
  return STRIP_PACK_PATTERN.test(normalizedPack);
};

export const isLiquidOrWeightPack = (packType?: string | null): boolean => {
  const normalizedPack = getPackTypeText(packType);
  if (!normalizedPack) return false;
  return LIQUID_WEIGHT_PACK_PATTERN.test(normalizedPack);
};

export const extractPackMultiplier = (packType?: string | null): number | null => {
  const normalizedPack = getPackTypeText(packType);
  if (!normalizedPack || isLiquidOrWeightPack(normalizedPack)) return null;

  const multiplierMatch = normalizedPack.match(PACK_MULTIPLIER_PATTERN);
  if (multiplierMatch) {
    const rightSide = parseInt(multiplierMatch[2], 10);
    if (Number.isFinite(rightSide) && rightSide > 0) return rightSide;
  }

  const allNumbers = normalizedPack.match(/\d+/g);
  if (!allNumbers || allNumbers.length === 0) return null;
  const candidate = parseInt(allNumbers[allNumbers.length - 1], 10);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
};

export const resolveUnitsPerStrip = (unitsPerPack?: number, packType?: string | null): number => {
  if (isLiquidOrWeightPack(packType)) return 1;
  const parsedFromPack = extractPackMultiplier(packType);
  if (parsedFromPack) return parsedFromPack;
  const parsed = Number(unitsPerPack || 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};
