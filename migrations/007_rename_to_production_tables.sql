-- Migration: Rename WA test tables to production tables
-- This allows us to expand from Washington to all states

BEGIN;

-- Rename representatives table
ALTER TABLE wa_test_representatives RENAME TO representatives;

-- Rename votes table  
ALTER TABLE wa_test_votes RENAME TO votes;

-- Update the foreign key constraint name for clarity
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_representative_id_fkey TO votes_representative_id_fkey;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_issue_id_fkey TO votes_issue_id_fkey;

-- Update constraint names
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_vote_check TO votes_vote_check;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_chamber_check TO votes_chamber_check;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_pkey TO votes_pkey;
ALTER TABLE votes RENAME CONSTRAINT wa_test_votes_rep_roll_chamber_unique TO votes_rep_roll_chamber_unique;

-- Add indexes for better performance when querying by state
CREATE INDEX IF NOT EXISTS idx_representatives_state ON representatives(state);
CREATE INDEX IF NOT EXISTS idx_representatives_bioguide ON representatives(bioguide_id);
CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(vote_date);

COMMIT;
