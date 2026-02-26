-- Backfill roll_call to include calendar year: house-{congress}-{year}-{roll_number}
-- So 2025 and 2026 roll numbers don't collide (Clerk uses per-year roll numbers).
-- Only touches rows where roll_call looks like the old 3-part format (e.g. house-119-232).

UPDATE votes
SET roll_call = 'house-' || congress || '-' || to_char(vote_date, 'YYYY') || '-' || roll_number
WHERE chamber = 'house'
  AND vote_date IS NOT NULL
  AND roll_number IS NOT NULL
  AND roll_call ~ '^house-[0-9]+-[0-9]+$';
