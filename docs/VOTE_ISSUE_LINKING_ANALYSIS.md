# Vote-to-Issue Linking Analysis

## Executive Summary

After analyzing raw vote and bill data from multiple sources, we've identified the key fields and strategies for reliably linking votes to issues (bills).

## Data Sources Analyzed

### 1. House Votes (clerk.house.gov XML)
Example: Roll #50, Feb 15, 2024 - H R 2766 (Uyghur Policy Act)

**Key Fields:**
```
rollcall-num: 50
congress: 118
session: "2nd"
chamber: "U.S. House of Representatives"
action-date: "15-Feb-2024"
legis-num: "H R 2766"                    ← PRIMARY LINKING FIELD
vote-question: "On Motion to Suspend..."
vote-desc: "Uyghur Policy Act"
legislator[@_name-id]: "A000370"         ← Bioguide ID
```

### 2. Congress.gov API - Bills
Example: HR 4984, HR 82, S 5319

**Key Fields:**
```json
{
  "type": "HR",              // or "S", "HJRES", "SJRES", etc.
  "number": "4984",
  "congress": 118,
  "title": "D.C. Robert F. Kennedy Memorial Stadium...",
  "originChamber": "House",
  "actions": {
    "url": "...actions endpoint with recordedVotes"
  }
}
```

### 3. Congress.gov API - Bill Actions
**Contains recorded votes:**
```json
{
  "recordedVotes": [
    {
      "rollNumber": 50,
      "chamber": "House",
      "date": "2024-02-15",
      "url": "...clerk.house.gov link"
    }
  ]
}
```

## The Linking Problem

### Current Issues:
1. **Format Variations**: Bill IDs come in many formats
   - House XML: `"H R 2766"` (with spaces)
   - Congress API: `type="HR"` + `number="2766"`
   - Our CSVs: `"HB-101"`, `"SB-58"` (non-standard)
   
2. **Missing Congress Numbers**: Without the congress number, "HR 1" is ambiguous
   - HR 1 in 118th Congress ≠ HR 1 in 117th Congress
   
3. **Amendment vs Bill Votes**: Senate often votes on amendments, not bills directly

4. **Multiple Votes per Bill**: A bill can have many votes (passage, amendments, recommit, etc.)

## Recommended Solution: Canonical Bill IDs

### Format Standard
```
{billtype}{number}-{congress}
```

### Examples:
- House vote "H R 2766" (Congress 118) → **`hr2766-118`**
- Senate vote "S 58" (Congress 118) → **`s58-118`**
- Joint Resolution "H J RES 5" → **`hjres5-118`**

### Normalization Rules:
```javascript
function normalizeToCanonical(billString, congress) {
  // Remove spaces, periods, hyphens
  // Convert to lowercase
  // Extract type (hr, s, hjres, sjres, hconres, sconres, hres, sres)
  // Extract number
  // Append congress
  
  "H R 2766" → "hr2766-118"
  "S. 58" → "s58-118"
  "HR-1234" → "hr1234-118"
}
```

## Implementation Strategy

### Phase 1: Update Database Schema

```sql
-- Already exists in issues table:
ALTER TABLE issues ADD COLUMN IF NOT EXISTS canonical_bill_id TEXT;
CREATE INDEX IF NOT EXISTS idx_issues_canonical ON issues(canonical_bill_id);

-- Update wa_test_votes to include linking fields:
ALTER TABLE wa_test_votes 
  ADD COLUMN IF NOT EXISTS canonical_bill_id TEXT,
  ADD COLUMN IF NOT EXISTS congress INTEGER DEFAULT 118,
  ADD COLUMN IF NOT EXISTS bill_type TEXT,
  ADD COLUMN IF NOT EXISTS bill_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_wa_votes_canonical ON wa_test_votes(canonical_bill_id);
```

### Phase 2: Populate Canonical IDs

**For Issues:**
1. Parse existing `bill_id` field
2. Extract type and number
3. Add congress number (default 118 for current)
4. Store in `canonical_bill_id`

**For Votes:**
1. Parse `legis-num` from House XML ("H R 2766")
2. Parse `bill` from Congress API
3. Normalize to canonical form
4. Store in vote record

### Phase 3: Linking Logic

```javascript
async function linkVoteToIssue(vote) {
  // 1. Try canonical bill ID match (fastest, most reliable)
  if (vote.canonical_bill_id) {
    const issue = await findIssueByCanonicalId(vote.canonical_bill_id);
    if (issue) return issue.id;
  }
  
  // 2. Try date + roll number match (for votes without bill reference)
  if (vote.vote_date && vote.roll_call) {
    const issue = await findIssueByDateAndRoll(
      vote.vote_date, 
      vote.roll_call, 
      vote.chamber
    );
    if (issue) return issue.id;
  }
  
  // 3. Create new issue from vote metadata
  return await createIssueFromVote(vote);
}
```

## Washington State Pilot Plan

### Step 1: Fetch Recent Bills with Votes
- Get bills from Congress API (last 100 days)
- Filter for bills with recorded votes
- Create issues with canonical IDs

### Step 2: Fetch Votes for WA Members
- Get House votes for WA districts (1-10)
- Get Senate votes for WA senators (Cantwell, Murray)
- Parse bill references and normalize
- Link to issues via canonical ID

### Step 3: Verify Linking
- Show match rate (should be >90% for bills, lower for procedural votes)
- Identify unmatched votes (amendments, nominations, etc.)
- Decide how to handle non-bill votes

## Edge Cases to Handle

### 1. Procedural Votes (No Bill)
- Quorum calls
- Election of Speaker
- Adjournment motions
**Solution**: Create special issue category or skip

### 2. Amendment Votes
- Vote is on amendment, not underlying bill
- Example: "Amendment 5 to S 58"
**Solution**: Link to parent bill, store amendment in metadata

### 3. Nominations
- Senate confirms judges, cabinet members
**Solution**: Create "nomination" issue type

### 4. Concurrent Resolutions
- Not legislation, but policy statements
**Solution**: Treat as issues but mark as non-binding

## Data Quality Metrics

Track these for ongoing validation:
- **Match Rate**: % of votes successfully linked to issues
- **Unmatched Votes**: Votes without issue links
- **Orphan Issues**: Issues without any votes
- **Duplicate Issues**: Multiple issues for same bill

## Next Steps for WA Pilot

1. ✅ Set up development database
2. ✅ Ingest WA members (12 total)
3. ⏳ Implement canonical ID normalization
4. ⏳ Fetch recent House/Senate votes
5. ⏳ Create issues from bills with votes
6. ⏳ Link WA member votes to issues
7. ⏳ Validate and measure match rate
8. ⏳ Adjust strategy based on results

---

*Generated: 2025-11-03*
*Analysis based on: House Roll #50 (HR 2766), Congress.gov API samples*
