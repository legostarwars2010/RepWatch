-- Add categories array to store bill topic tags
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS categories TEXT[];

-- Add index for faster category searches
CREATE INDEX IF NOT EXISTS idx_issues_categories ON issues USING GIN(categories);
