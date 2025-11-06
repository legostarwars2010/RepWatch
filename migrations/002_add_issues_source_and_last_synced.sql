-- Migration: add source and last_synced to issues
BEGIN;

ALTER TABLE IF EXISTS issues
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE IF EXISTS issues
  ADD COLUMN IF NOT EXISTS last_synced TIMESTAMP WITH TIME ZONE;

COMMIT;

-- Note: this migration intentionally keeps defaults NULL to avoid overwriting existing data.
