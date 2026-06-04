-- MBC Card Value History
-- Tracks each Add Card Value transaction for MBC cards.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mbc_card_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  card_number text NOT NULL,
  customer_name text,
  previous_value numeric DEFAULT 0,
  added_value numeric NOT NULL,
  new_value numeric NOT NULL,
  added_by text,
  remarks text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbc_card_value_history_card_id_created_at
  ON mbc_card_value_history (card_id, created_at DESC);
