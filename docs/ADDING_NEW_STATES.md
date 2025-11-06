# Adding New States to RepWatch - Easiest Path Forward

## Current State (Washington Pilot)
✅ **Working Components:**
- 12 WA representatives in `wa_test_representatives` table
- 900 votes (400 from 2024, 500 from 2025) in `wa_test_votes` table
- 62 issues with 100% vote linking
- AI summaries for all bills
- Address resolution (works nationwide already!)
- Interactive lookup tool

## Option 1: Expand in Place (Recommended for Quick Growth)
**Use existing tables, just add more states**

### Steps:
1. **Rename tables** to remove "wa_test" prefix:
   ```sql
   ALTER TABLE wa_test_representatives RENAME TO representatives;
   ALTER TABLE wa_test_votes RENAME TO votes;
   ```

2. **Ingest new state members** (already have the script!):
   - Modify `scripts/ingest_washington_members.js` → `scripts/ingest_state_members.js`
   - Add parameter for state (e.g., `--state CA`, `--state NY`)
   - Run for each new state

3. **Fetch votes for new states**:
   - Modify `scripts/fetch_latest_votes_wa.js` → `scripts/fetch_latest_votes.js`
   - Remove WA bioguide filter, fetch ALL members' votes
   - Or keep filtered approach: pass state bioguides as parameter

4. **Create issues and summarize** (no changes needed!):
   - `scripts/create_issues_from_votes.js` already works for any bills
   - `scripts/quick_summarize_wa_votes.js` → rename to generic name

**Effort:** 1-2 hours, mostly find/replace and testing
**Pros:** Fastest path, reuse all existing code
**Cons:** Table names say "wa_test" (but we'd rename them)

## Option 2: Migration to Production Schema (Cleaner)
**Create proper production tables, migrate WA data**

### Steps:
1. **Create production tables** (copy from migrations/003):
   ```sql
   CREATE TABLE representatives (...);  -- like wa_test_representatives
   CREATE TABLE votes (...);            -- like wa_test_votes
   ```

2. **Migrate existing WA data**:
   ```sql
   INSERT INTO representatives SELECT * FROM wa_test_representatives;
   INSERT INTO votes SELECT * FROM wa_test_votes;
   ```

3. **Update scripts** to use new table names (find/replace)

4. **Ingest additional states** using same scripts

**Effort:** 2-3 hours
**Pros:** Clean schema, production-ready
**Cons:** Need to test migration, update all scripts

## Option 3: Multi-State Tables (Most Scalable)
**Add state filtering to existing approach**

Already mostly done! Your tables have a `state` column. Just:

1. Keep `wa_test_*` tables OR rename to `representatives`/`votes`
2. Add index on `state` column for performance
3. Modify ingestion scripts to accept `--states` parameter
4. Run ingestion for multiple states: `--states WA,OR,CA`

**Effort:** 30 minutes - 1 hour
**Pros:** Simplest, already 90% there
**Cons:** Might want to rename tables

---

## Recommended Approach: **Option 1 (Expand in Place)**

### Quick Start (5 commands):

```bash
# 1. Rename tables (copy to new script: scripts/rename_to_production.js)
node scripts/rename_to_production.js

# 2. Ingest Oregon representatives (example)
node scripts/ingest_state_members.js --state OR

# 3. Fetch latest votes for all members (modified to remove WA filter)
node scripts/fetch_latest_votes.js

# 4. Create issues from votes (no changes needed!)
node scripts/create_issues_from_votes.js

# 5. Generate AI summaries (no changes needed!)
node scripts/quick_summarize_wa_votes.js
```

### What to Modify:

**File 1: `scripts/ingest_state_members.js`** (copy from ingest_washington_members.js)
- Add command line arg: `process.argv` to get `--state XX`
- Filter legislators by state from `legislators-current.yaml`

**File 2: `scripts/fetch_latest_votes.js`** (copy from fetch_latest_votes_wa.js)
- Remove `WA_BIOGUIDES` hardcoded list
- Query database for ALL bioguides: `SELECT bioguide_id FROM representatives`
- Or accept `--state` parameter to filter

**File 3: Table rename migration**
- Simple SQL: `ALTER TABLE wa_test_representatives RENAME TO representatives`

---

## Which States to Add First?

**High Priority (Large states, high engagement):**
- California (52 representatives) 
- Texas (38 representatives)
- Florida (28 representatives)
- New York (26 representatives)

**Easy Wins (Small states, quick testing):**
- Oregon (6 representatives) - neighbors WA
- Nevada (4 representatives)
- Idaho (2 representatives)

---

## Data Already Available

✅ **You already have:**
- `legislators-current.yaml` - ALL 535 members of Congress
- House Clerk XML votes - ALL representatives' votes
- Legiscan cache - 1,000 bills (multiple states)
- Address resolver - works for ALL 50 states
- Bill normalization - works for any bill

🎯 **Bottom line:** You can add ANY state in ~30 minutes once you pick your approach!

---

## My Recommendation

Start with **Option 3** (simplest):

1. Add `--states` parameter to ingestion scripts
2. Run for 2-3 small states (OR, ID, NV) to test
3. If it works, do batch ingestion: all 50 states at once!
4. Later, rename tables for cleaner schema

Want me to create the multi-state ingestion scripts?
