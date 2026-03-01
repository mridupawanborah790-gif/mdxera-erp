export const getPackTypeText = (packType?: string | null): string => (packType || '').trim();

// Strip-based examples: 10s, 2'S, 10 TAB, 10 Cap, 15 tablets
const STRIP_PACK_PATTERN = /\b\d+\s*(?:['’]?s|tab(?:let)?s?|cap(?:sule)?s?)\b/i;
const LIQUID_WEIGHT_PACK_PATTERN = /\b(?:\d+(?:\.\d+)?)\s*(?:ml|millilit(?:er|re)s?|l|ltr|lit(?:er|re)s?|mg|milligram(?:s)?|g|gm|gram(?:s)?|kg|kilogram(?:s)?)\b/i;

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

export const resolveUnitsPerStrip = (unitsPerPack?: number, packType?: string | null): number => {
  if (isLiquidOrWeightPack(packType)) return 1;
  const parsed = Number(unitsPerPack || 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};
