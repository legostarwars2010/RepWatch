-- Add issue_token column to vote_records to store normalized bill token (e.g., HR3015)
ALTER TABLE vote_records ADD COLUMN IF NOT EXISTS issue_token TEXT;
-- Create a uniqueness index on (rep_id, issue_token) so upserts can deduplicate by token
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_vote_rep_issue_token ON vote_records(rep_id, issue_token);
