/**
 * Smart Fuzzy Match utility for Medimart Retail.
 * Supports token-based matching to allow searching across separators.
 * e.g., "MYOTOPSR" matches "MYOTOP 450 SR TAB"
 */
export const fuzzyMatch = (target: string | undefined | null, query: string | undefined | null): boolean => {
    // If query is null or undefined, treat it as an empty string.
    // An empty query matches everything, so return true.
    if (!query || String(query).trim() === '') return true;
    
    // If target is null or undefined, it cannot match any non-empty query.
    if (!target) return false;

    const t = target.toLowerCase();
    const q = String(query).toLowerCase().trim();

    // 1. Direct substring match (Fastest)
    if (t.includes(q)) return true;

    // 2. Compact match (Ignore spaces and special chars)
    const tClean = t.replace(/[^a-z0-9]/g, '');
    const qClean = q.replace(/[^a-z0-9]/g, '');
    if (tClean.includes(qClean)) return true;

    // 3. Token-based match: Split query into chunks of letters and numbers
    // e.g., "MYOTOP 450" -> ["myotop", "450"]
    const tokens = q.split(/\s+/).filter(Boolean);
    
    if (tokens.length > 0) {
        // Every token in the search query must be present in the cleaned target string
        const match = tokens.every(token => {
            const cleanToken = token.replace(/[^a-z0-9]/g, '');
            return tClean.includes(cleanToken);
        });
        if (match) return true;
    }

    // 4. Reverse compact match for tokens (e.g., "MYOTOPSR" typed as one word matching "MYOTOP SR")
    // We try to see if the query (cleaned) is a partial match of the target (cleaned)
    // or if the query can be found by skipping characters
    if (qClean.length > 2) {
        let i = 0;
        let j = 0;
        while (i < tClean.length && j < qClean.length) {
            if (tClean[i] === qClean[j]) {
                j++;
            }
            i++;
        }
        if (j === qClean.length) return true;
    }

    return false;
};
