export const getPackTypeText = (packType?: string | null): string => (packType || '').trim();

// Strip-based examples: 10s, 2'S, 10 TAB, 10 Cap, 15 tablets
const STRIP_PACK_PATTERN = /\b\d+\s*(?:['’]?s|tab(?:let)?s?|cap(?:sule)?s?)\b/i;

export const isStripBasedPack = (packType?: string | null): boolean => {
  const normalizedPack = getPackTypeText(packType);
  if (!normalizedPack) return false;
  return STRIP_PACK_PATTERN.test(normalizedPack);
};
