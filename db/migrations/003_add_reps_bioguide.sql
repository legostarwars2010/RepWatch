-- 003_add_reps_bioguide.sql
-- Add bioguide_id and external_ids to representatives to support stable upserts

BEGIN;

ALTER TABLE representatives
  ADD COLUMN IF NOT EXISTS bioguide_id TEXT;

ALTER TABLE representatives
  ADD COLUMN IF NOT EXISTS external_ids JSONB;

-- Unique index on bioguide_id for reliable ON CONFLICT upserts; allow NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_reps_bioguide
  ON representatives (bioguide_id)
  WHERE bioguide_id IS NOT NULL;

COMMIT;
