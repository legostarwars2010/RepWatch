-- 005_add_phone_website.sql
-- Add phone and website columns to representatives

BEGIN;

ALTER TABLE representatives
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE representatives
  ADD COLUMN IF NOT EXISTS website TEXT;

COMMIT;
