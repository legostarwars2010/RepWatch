-- 004_bioguide_unique_index.sql
-- Ensure there's a non-partial unique index on bioguide_id to support ON CONFLICT (bioguide_id)

BEGIN;

-- Create a plain unique index (non-partial). Use a distinct name to avoid colliding with existing index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reps_bioguide_unique ON representatives(bioguide_id);

COMMIT;
