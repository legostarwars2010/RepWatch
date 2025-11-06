-- Create test tables for Washington state pilot
-- These mirror the main tables but are prefixed with wa_test_

-- Washington state representatives test table
CREATE TABLE IF NOT EXISTS wa_test_representatives (
  id SERIAL PRIMARY KEY,
  bioguide_id TEXT UNIQUE NOT NULL,
  name TEXT,
  party TEXT,
  state TEXT,
  chamber TEXT CHECK (chamber IN ('house', 'senate')),
  district INTEGER,
  contact_json JSONB,
  external_ids JSONB,
  phone TEXT,
  website TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wa_test_reps_bioguide_idx ON wa_test_representatives(bioguide_id);
CREATE INDEX IF NOT EXISTS wa_test_reps_state_idx ON wa_test_representatives(state);
CREATE INDEX IF NOT EXISTS wa_test_reps_chamber_idx ON wa_test_representatives(chamber);

-- Washington state votes test table
CREATE TABLE IF NOT EXISTS wa_test_votes (
  id SERIAL PRIMARY KEY,
  representative_id INTEGER REFERENCES wa_test_representatives(id) ON DELETE CASCADE,
  issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  vote TEXT CHECK (vote IN ('yes', 'no', 'abstain', 'present', 'not voting')),
  vote_date DATE,
  roll_call TEXT,
  chamber TEXT CHECK (chamber IN ('house', 'senate')),
  session INTEGER,
  vote_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(representative_id, issue_id, roll_call, chamber)
);

CREATE INDEX IF NOT EXISTS wa_test_votes_rep_idx ON wa_test_votes(representative_id);
CREATE INDEX IF NOT EXISTS wa_test_votes_issue_idx ON wa_test_votes(issue_id);
CREATE INDEX IF NOT EXISTS wa_test_votes_date_idx ON wa_test_votes(vote_date);
CREATE INDEX IF NOT EXISTS wa_test_votes_chamber_idx ON wa_test_votes(chamber);

-- Add comment to track purpose
COMMENT ON TABLE wa_test_representatives IS 'Test table for Washington state representatives pilot - safe to drop';
COMMENT ON TABLE wa_test_votes IS 'Test table for Washington state votes pilot - safe to drop';
