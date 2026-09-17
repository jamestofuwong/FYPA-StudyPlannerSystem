-- Migration: add unit_offerings table
-- This table was added to the schema after the init migration was already applied.

CREATE TABLE IF NOT EXISTS unit_offerings (
    unit_id     UUID          NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    offered_in  SMALLINT      NOT NULL CHECK (offered_in BETWEEN 1 AND 4),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (unit_id, offered_in)
);

CREATE INDEX IF NOT EXISTS idx_unit_offerings_term ON unit_offerings(offered_in);

CREATE OR REPLACE TRIGGER trg_unit_offerings_updated_at
  BEFORE UPDATE ON unit_offerings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
