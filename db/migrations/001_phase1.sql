-- 001_phase1.sql
-- Idempotent migration for Phase 1: schema for users, districts, representatives, issues, vote_records

BEGIN;

-- users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  address_json JSONB,
  district TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- districts
CREATE TABLE IF NOT EXISTS districts (
  id SERIAL PRIMARY KEY,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  chamber TEXT NOT NULL,
  geojson JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state, district, chamber)
);

-- representatives
CREATE TABLE IF NOT EXISTS representatives (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  chamber TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT,
  party TEXT,
  contact_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- issues (with AI summary fields)
CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  title TEXT,
  description TEXT,
  bill_id TEXT UNIQUE,
  vote_date DATE,
  ai_summary JSONB,
  ai_summary_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- vote_records
CREATE TABLE IF NOT EXISTS vote_records (
  id SERIAL PRIMARY KEY,
  rep_id INTEGER REFERENCES representatives(id) ON DELETE CASCADE,
  issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  vote TEXT,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_issues_bill_id ON issues(bill_id);
CREATE INDEX IF NOT EXISTS idx_reps_state_chamber_district ON representatives(state, chamber, district);
CREATE INDEX IF NOT EXISTS idx_vote_records_rep_issue ON vote_records(rep_id, issue_id);

-- Unique index to support upserts on vote_records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'uniq_vote_rep_issue'
  ) THEN
    CREATE UNIQUE INDEX uniq_vote_rep_issue ON vote_records(rep_id, issue_id);
  END IF;
END$$;

COMMIT;
