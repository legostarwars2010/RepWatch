-- Add unique constraint on canonical_bill_id for issues table
-- This allows ON CONFLICT (canonical_bill_id) to work in insert statements

ALTER TABLE issues ADD CONSTRAINT issues_canonical_bill_id_unique UNIQUE (canonical_bill_id);

-- Also make bill_id not unique since we'll use canonical_bill_id as the primary unique identifier
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_bill_id_key;
