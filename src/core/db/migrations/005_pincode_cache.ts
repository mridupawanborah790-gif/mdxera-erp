// Local cache for pincode → district/state lookups.
// Populated from the postalpincode.in API on first lookup of each pincode,
// then read from cache on subsequent calls (also working offline).
export const SQL_005_PINCODE_CACHE = `
CREATE TABLE IF NOT EXISTS pincode_cache (
  pincode TEXT PRIMARY KEY,
  district TEXT,
  state TEXT,
  cached_at INTEGER NOT NULL
);
`;
