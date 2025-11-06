-- Add table to archive unmapped/skipped vote rows for auditing
BEGIN;

CREATE TABLE IF NOT EXISTS vote_records_unmapped (
  id SERIAL PRIMARY KEY,
  rep_id INTEGER REFERENCES representatives(id) ON DELETE SET NULL,
  raw_token TEXT,
  raw_xml TEXT,
  filename TEXT,
  vote_raw TEXT,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vote_records_unmapped_filename ON vote_records_unmapped(filename);

COMMIT;
