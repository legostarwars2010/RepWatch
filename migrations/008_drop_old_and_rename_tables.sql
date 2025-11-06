-- Drop old empty tables and rename WA test tables to production

BEGIN;

-- Drop old empty tables
DROP TABLE IF EXISTS vote_records CASCADE;
DROP TABLE IF EXISTS representatives CASCADE;

-- Rename WA test tables to production names
ALTER TABLE wa_test_representatives RENAME TO representatives;
ALTER TABLE wa_test_votes RENAME TO votes;

-- Update constraint names for votes table
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_representative_id_fkey TO votes_representative_id_fkey;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_issue_id_fkey TO votes_issue_id_fkey;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_vote_check TO votes_vote_check;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_chamber_check TO votes_chamber_check;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_pkey TO votes_pkey;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_rep_roll_chamber_unique TO votes_rep_roll_chamber_unique;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_representatives_state ON representatives(state);
CREATE INDEX IF NOT EXISTS idx_representatives_bioguide ON representatives(bioguide_id);
CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(vote_date);
CREATE INDEX IF NOT EXISTS idx_votes_representative ON votes(representative_id);
CREATE INDEX IF NOT EXISTS idx_votes_issue ON votes(issue_id);

COMMIT;
