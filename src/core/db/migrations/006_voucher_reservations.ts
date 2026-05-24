// Voucher number range reservations.
// Each row represents a chunk of numbers reserved by the server for this device.
// Numbers are consumed sequentially from `next_available` to `range_end`.
// When `next_available > range_end`, the reservation is exhausted and a new
// one must be requested from the server (requires internet).
export const SQL_006_VOUCHER_RESERVATIONS = `
CREATE TABLE IF NOT EXISTS voucher_reservations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  fy TEXT NOT NULL,
  device_id TEXT NOT NULL,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  next_available INTEGER NOT NULL,
  reserved_at INTEGER NOT NULL,
  exhausted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vr_active
  ON voucher_reservations(organization_id, document_type, fy, exhausted);
`;
