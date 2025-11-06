-- Migration: add external_ids JSONB and canonical_bill_id to issues
BEGIN;
ALTER TABLE IF EXISTS issues
  ADD COLUMN IF NOT EXISTS external_ids JSONB;

ALTER TABLE IF EXISTS issues
  ADD COLUMN IF NOT EXISTS canonical_bill_id TEXT;

-- Optionally create an index to speed lookups by canonical_bill_id
CREATE INDEX IF NOT EXISTS idx_issues_canonical_bill_id ON issues USING btree((canonical_bill_id));

COMMIT;
