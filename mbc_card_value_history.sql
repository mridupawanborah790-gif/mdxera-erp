-- MBC Card Value History
-- Tracks each Add Card Value transaction for MBC cards.
-- organization_id is required for multi-tenant row isolation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mbc_card_value_history (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid       NOT NULL,
  card_id        uuid        NOT NULL,
  card_number    text        NOT NULL,
  customer_name  text,
  previous_value numeric     DEFAULT 0,
  added_value    numeric     NOT NULL,
  new_value      numeric     NOT NULL,
  added_by       text,
  remarks        text,
  created_at     timestamptz DEFAULT now()
);

-- Index for per-card history queries (e.g. the detail overlay)
CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_card_id_created_at
  ON mbc_card_value_history (card_id, created_at DESC);

-- Index for per-org queries (sync pulls, reports)
CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_org_created_at
  ON mbc_card_value_history (organization_id, created_at DESC);

-- ── Migration: add organization_id to an existing deployment ─────────────────
-- Run this block if the table already exists without the column.
-- Safe to run multiple times (DO block guards against duplicate column error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mbc_card_value_history'
      AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE mbc_card_value_history
      ADD COLUMN organization_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

    -- Backfill organization_id from the linked card
    UPDATE mbc_card_value_history vh
    SET    organization_id = c.organization_id
    FROM   mbc_cards c
    WHERE  c.id = vh.card_id;

    CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_org_created_at
      ON mbc_card_value_history (organization_id, created_at DESC);
  END IF;
END;
$$;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Enable RLS and add a policy matching the pattern used by mbc_cards /
-- mbc_card_history. Adjust the policy to match your project's auth strategy.
--
-- ALTER TABLE mbc_card_value_history ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "org_isolation" ON mbc_card_value_history
--   FOR ALL
--   USING  (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
--   WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

