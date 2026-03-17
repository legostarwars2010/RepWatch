-- Add long-form summary support to pipeline v2 bill semantics.
-- This migration only touches v2_* tables.

ALTER TABLE v2_bill_semantic_outputs
ADD COLUMN IF NOT EXISTS long_summary TEXT;
