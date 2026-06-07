-- MBC Card Value History
-- Tracks each Add Card Value transaction for MBC cards.
-- organization_id is required for multi-tenant row isolation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Fresh install ──────────────────────────────────────────────────────────────
-- Creates the table only if it doesn't exist yet. organization_id is included
-- from the start. If the table already exists, this is a no-op.
CREATE TABLE IF NOT EXISTS mbc_card_value_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  card_id         text        NOT NULL,
  card_number     text        NOT NULL,
  customer_name   text,
  previous_value  numeric     DEFAULT 0,
  added_value     numeric     NOT NULL,
  new_value       numeric     NOT NULL,
  added_by        text,
  remarks         text,
  created_at      timestamptz DEFAULT now()
);

-- Per-card history index (always safe — card_id exists in both old and new schema)
CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_card_id_created_at
  ON mbc_card_value_history (card_id, created_at DESC);

-- ── Migration: add organization_id to an existing deployment ──────────────────
-- Safe to run multiple times. Acts only if the column is missing.
-- The per-org index is created INSIDE this block so it only runs after the
-- column has been added (avoids "column does not exist" at the top level).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'mbc_card_value_history'
      AND  column_name = 'organization_id'
  ) THEN
    -- Step 1: add the column as text (matches mbc_cards.organization_id type)
    ALTER TABLE mbc_card_value_history
      ADD COLUMN organization_id text NOT NULL DEFAULT '';

    -- Step 2: backfill from the linked mbc_cards row
    EXECUTE $sql$
      UPDATE mbc_card_value_history vh
      SET    organization_id = c.organization_id
      FROM   mbc_cards c
      WHERE  c.id = vh.card_id
    $sql$;

    -- Step 3: add the per-org index NOW that the column exists
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_org_created_at
        ON mbc_card_value_history (organization_id, created_at DESC)
    $sql$;
  ELSE
    -- Column already exists — ensure the index exists too
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_org_created_at
        ON mbc_card_value_history (organization_id, created_at DESC)
    $sql$;
  END IF;
END;
$$;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Enable RLS and add a policy matching the pattern used by mbc_cards /
-- mbc_card_history. Adjust the policy body to match your project's auth setup.
--
-- ALTER TABLE mbc_card_value_history ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "org_isolation" ON mbc_card_value_history
--   FOR ALL
--   USING  (organization_id = (auth.jwt() ->> 'organization_id'))
--   WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id'));
