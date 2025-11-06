-- Fix the unique constraint on wa_test_votes
-- The constraint should be on (rep, roll_call, chamber) to prevent duplicate votes
-- Not on (rep, issue_id, roll_call, chamber) which breaks when we link votes to issues

-- Drop the old constraint
ALTER TABLE wa_test_votes DROP CONSTRAINT IF EXISTS wa_test_votes_representative_id_issue_id_roll_call_chamber_key;

-- Add the correct constraint
ALTER TABLE wa_test_votes ADD CONSTRAINT wa_test_votes_rep_roll_chamber_unique 
  UNIQUE (representative_id, roll_call, chamber);
