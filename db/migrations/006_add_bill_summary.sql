-- Add bill_summary column to store CRS summaries from Congress.gov
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS bill_summary TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_issues_bill_summary ON issues(id) WHERE bill_summary IS NOT NULL;
