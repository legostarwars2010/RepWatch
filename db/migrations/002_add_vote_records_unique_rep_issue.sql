-- Add unique index to support ON CONFLICT upserts on vote_records
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'uniq_vote_rep_issue' AND n.nspname = 'public') THEN
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_vote_rep_issue ON vote_records(rep_id, issue_id);
  END IF;
END$$;
