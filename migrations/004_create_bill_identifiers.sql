-- Create canonical bill mapping table
-- This table maps various bill reference formats to a single canonical ID

CREATE TABLE IF NOT EXISTS bill_identifiers (
  id SERIAL PRIMARY KEY,
  canonical_bill_id TEXT NOT NULL,
  
  -- Core bill information
  bill_type TEXT NOT NULL,           -- 'hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'
  bill_number INTEGER NOT NULL,
  congress INTEGER NOT NULL,
  
  -- Alternative representations
  raw_identifier TEXT,                -- Original string as found (e.g., "H R 2766", "HB82")
  source TEXT,                        -- Where this came from: 'clerk', 'congress_api', 'legiscan', 'manual'
  
  -- Metadata
  bill_title TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(canonical_bill_id)
);

-- Index for fast lookups by canonical ID
CREATE INDEX IF NOT EXISTS idx_bill_identifiers_canonical ON bill_identifiers(canonical_bill_id);

-- Index for lookups by raw identifier
CREATE INDEX IF NOT EXISTS idx_bill_identifiers_raw ON bill_identifiers(raw_identifier);

-- Index for lookups by components
CREATE INDEX IF NOT EXISTS idx_bill_identifiers_components ON bill_identifiers(bill_type, bill_number, congress);

-- Add canonical_bill_id to issues if not exists
ALTER TABLE issues ADD COLUMN IF NOT EXISTS canonical_bill_id TEXT;
CREATE INDEX IF NOT EXISTS idx_issues_canonical_bill ON issues(canonical_bill_id);

-- Add canonical_bill_id and related fields to wa_test_votes
ALTER TABLE wa_test_votes 
  ADD COLUMN IF NOT EXISTS canonical_bill_id TEXT,
  ADD COLUMN IF NOT EXISTS congress INTEGER DEFAULT 118,
  ADD COLUMN IF NOT EXISTS roll_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_wa_test_votes_canonical_bill ON wa_test_votes(canonical_bill_id);
CREATE INDEX IF NOT EXISTS idx_wa_test_votes_roll ON wa_test_votes(chamber, congress, roll_number);

-- Comments for documentation
COMMENT ON TABLE bill_identifiers IS 'Maps various bill reference formats to canonical IDs for reliable vote-to-issue linking';
COMMENT ON COLUMN bill_identifiers.canonical_bill_id IS 'Format: {billtype}{number}-{congress} e.g., hr2766-118, s58-118';
COMMENT ON COLUMN bill_identifiers.raw_identifier IS 'Original format as found in source data';
