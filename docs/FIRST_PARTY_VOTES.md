# First-Party Vote Ingestion System

Complete documentation for the first-party vote ingestion pipeline that replaces LegiScan with direct congressional data sources.

## Overview

This system ingests congressional votes from **first-party sources** (House Clerk EVS and Senate roll-call XML) and resolves them to bills using BILLSTATUS XML files, achieving deterministic vote-to-bill matching without external APIs.

## Architecture

### Data Flow

```
House EVS JSON/XML ─┐
                    ├──► Vote Resolver ──► BILLSTATUS Index ──► Resolved Votes ──► Database
Senate Vote XML ────┘
```

### Components

1. **lib/vote_keys.js** - Deterministic key generation
   - `makeVoteKey(chamber, date, roll)` → `"house:2025-01-20:42"`
   - `makeBillKey(congress, type, number)` → `"119:hr:815"`

2. **lib/motion_normalizer.js** - Motion text canonicalization
   - 12 motion families (passage, amend, veto_override, etc.)
   - Fuzzy matching with confidence scoring

3. **services/evs_house_reader.js** - House EVS parser
   - Parses JSON/XML from House Clerk
   - Outputs `NormalizedVote` DTO

4. **services/senate_votes_reader.js** - Senate vote parser
   - Parses roll-call XML from Senate.gov
   - Handles nominations (Guilty/Not Guilty votes)

5. **services/billstatus_index.js** - BILLSTATUS indexer
   - Indexes by date, roll number, and bill_key
   - Provides text URLs for each bill

6. **services/vote_resolver.js** - 4-step resolution
   - **Step 1**: Exact roll match (target ≥95%)
   - **Step 2**: Bill same-day match
   - **Step 3**: Motion guardrail with canonicalization
   - **Step 4**: Amendment linking

## Usage

### 1. Run Integration Test

Test the entire pipeline with recent data:

```bash
node scripts/test_first_party_integration.js \
  --start-date 2025-01-20 \
  --end-date 2025-01-27 \
  --download \
  --upsert
```

### 2. Manual Ingestion

Run the pipeline manually with custom inputs:

```bash
node scripts/ingest_first_party_votes.js \
  --evs "data/backups/evs_parsed_recent_fixed_*.json" \
  --senate 119-1 \
  --billstatus "data/bill_texts/" \
  --out data/derived/votes_first_party.jsonl
```

### 3. Validate Results

Check acceptance criteria:

```bash
node scripts/validate_first_party_votes.js \
  --log data/derived/votes_first_party_log.jsonl
```

### 4. Upsert to Database

Load resolved votes into PostgreSQL:

```bash
node scripts/upsert_votes_to_db.js \
  --votes data/derived/votes_first_party.jsonl \
  --dry-run  # Remove to actually write
```

## Acceptance Criteria

The system must meet these thresholds:

- ✅ **≥95%** exact roll match rate
- ✅ **≥99%** overall resolution rate
- ✅ **Zero** duplicate vote_key → bill mappings
- ✅ **All** resolved votes have ≥1 bill text URL

## Data Sources

### House Votes (EVS)

**Source**: House Clerk Electronic Voting System  
**Format**: JSON or XML  
**URL Pattern**: `https://clerk.house.gov/evs/{year}/{roll}.xml`

**Example EVS XML**:
```xml
<rollcall-vote>
  <vote-metadata>
    <congress>119</congress>
    <session>1</session>
    <chamber>House</chamber>
    <rollcall-num>42</rollcall-num>
    <vote-question>On Passage</vote-question>
    <legis-num>H.R. 815</legis-num>
  </vote-metadata>
  <vote-data>
    <recorded-vote>
      <legislator>Smith</legislator>
      <vote>Yea</vote>
    </recorded-vote>
  </vote-data>
</rollcall-vote>
```

### Senate Votes

**Source**: Senate Legislative Information System (LIS)  
**Format**: XML  
**Menu URL**: `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml`  
**Vote URL**: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{roll}.xml`

**Example Senate XML**:
```xml
<roll_call_vote>
  <congress>119</congress>
  <session>1</session>
  <vote_number>15</vote_number>
  <vote_date>January 20, 2025</vote_date>
  <question>On Passage of the Bill</question>
  <vote_title>H.R. 815</vote_title>
  <members>
    <member>
      <first_name>John</first_name>
      <last_name>Smith</last_name>
      <vote_cast>Yea</vote_cast>
    </member>
  </members>
</roll_call_vote>
```

### BILLSTATUS Files

**Source**: Congress.gov bulk data via GovInfo  
**Format**: XML  
**URL Pattern**: `https://www.govinfo.gov/bulkdata/BILLSTATUS/{congress}/{type}/`

**Example BILLSTATUS XML**:
```xml
<billStatus>
  <bill>
    <congress>119</congress>
    <type>HR</type>
    <number>815</number>
    <actions>
      <item>
        <actionDate>2025-01-20</actionDate>
        <sourceSystem>
          <code>2</code>
          <name>House floor actions</name>
        </sourceSystem>
        <actionCode>H38310</actionCode>
        <type>Floor</type>
        <recordedVotes>
          <recordedVote>
            <rollNumber>42</rollNumber>
            <chamber>House</chamber>
          </recordedVote>
        </recordedVotes>
      </item>
    </actions>
    <textVersions>
      <item>
        <type>Introduced in House</type>
        <formats>
          <item>
            <url>https://www.govinfo.gov/content/pkg/BILLS-119hr815ih/xml/BILLS-119hr815ih.xml</url>
          </item>
        </formats>
      </item>
    </textVersions>
  </bill>
</billStatus>
```

## Resolution Logic

### Step 1: Exact Roll Match (Target ≥95%)

Match by chamber, date, and roll number from BILLSTATUS `<recordedVote>` entries.

**Why this works**: BILLSTATUS files contain `<recordedVote>` elements linking bills to specific roll-call votes.

**Date tolerance**: ±1 day to handle timezone differences.

### Step 2: Bill Same-Day Match

If exact roll fails, match by bill reference extracted from motion text and vote date.

**Example**: Vote on "H.R. 815" on 2025-01-20 matches BILLSTATUS for HR 815 with same-day action.

### Step 3: Motion Guardrail

Canonicalize motion text to 12 standard families and fuzzy-match with BILLSTATUS action types.

**Motion families**:
- `passage` - On Passage, Final Passage
- `amend` - On Agreeing to Amendment, On Amendment
- `cloture` - On Cloture, To Invoke Cloture
- `motion_to_proceed` - On Motion to Proceed
- `veto_override` - On Overriding Veto
- `concur` - On Concurring, On Concurrence
- `recommit` - On Motion to Recommit
- `table` - On Motion to Table
- `suspend_rules` - On Motion to Suspend Rules
- `agree_resolution` - On Agreeing to Resolution
- `previous_question` - On Previous Question
- `appeal_ruling` - On Appeal of Ruling

**Confidence scoring**:
- 1.0 - Exact motion match
- 0.9 - Same family
- 0.7 - Partial match

### Step 4: Amendment Linking

Extract amendment numbers from motion text and link to parent bill.

**Example**: "On Agreeing to Amendment No. 1234 to H.R. 815" links to HR 815.

## NormalizedVote DTO

All parsers output this standard format:

```javascript
{
  vote_key: "house:2025-01-20:42",
  chamber: "house",
  date: "2025-01-20",
  roll_number: 42,
  congress: 119,
  session: 1,
  question: "On Passage",
  result: "Passed",
  yeas: 235,
  nays: 195,
  present: 0,
  not_voting: 5,
  bill_reference: "H.R. 815",
  votes: [
    { bioguide_id: "S000001", name: "Smith, John", vote: "Yea" }
  ]
}
```

## Resolution Output

The resolver adds this metadata:

```javascript
{
  resolution: {
    resolved: true,
    step: "exact_roll",
    confidence: 1.0,
    bill_key: "119:hr:815",
    canonical_bill_id: "hr815-119",
    bill_text_urls: [
      "https://www.govinfo.gov/content/pkg/BILLS-119hr815ih/xml/BILLS-119hr815ih.xml"
    ],
    reason: null
  }
}
```

## Feature Flags

Control vote ingestion source via environment variable:

```bash
# Use only first-party sources
export VOTE_SOURCE=first_party

# Use both first-party and LegiScan (dual validation)
export VOTE_SOURCE=dual

# Use only LegiScan (legacy)
export VOTE_SOURCE=legiscan
```

## Testing

### Component Tests

Test individual components:

```bash
node tools/test-vote-components.js
```

**Test coverage**:
- ✅ Vote key generation
- ✅ Bill key generation
- ✅ Bill reference extraction
- ✅ Roll number extraction
- ✅ Motion canonicalization
- ✅ EVS JSON parsing
- ✅ Key parsing/formatting

### Integration Test

Test full pipeline end-to-end:

```bash
node scripts/test_first_party_integration.js \
  --start-date 2025-01-20 \
  --end-date 2025-01-27
```

### Validation Checks

The validation script checks:
1. Resolution rate statistics
2. Duplicate vote_key → bill mappings
3. Missing bill text URLs
4. Sample of unresolved votes with reasons

## Troubleshooting

### Low Exact Roll Match Rate

**Symptoms**: Exact roll match rate < 95%

**Causes**:
- BILLSTATUS files missing or incomplete
- Date parsing issues (timezone differences)
- Roll number extraction errors

**Solutions**:
1. Verify BILLSTATUS files are downloaded for correct congress
2. Check `indexDirectory()` logs for indexing errors
3. Review unresolved votes with `vote_key` and `bill_reference`

### Low Overall Resolution Rate

**Symptoms**: Overall resolution rate < 99%

**Causes**:
- Motion text doesn't match any canonical family
- Bill reference extraction failing
- BILLSTATUS missing actions for procedural votes

**Solutions**:
1. Review unresolved votes for common motion patterns
2. Add new motion families to `lib/motion_normalizer.js`
3. Improve bill reference regex in `lib/vote_keys.js`

### Duplicate Mappings

**Symptoms**: Multiple bills mapped to same vote_key

**Causes**:
- Logic error in resolver steps
- Non-deterministic key generation

**Solutions**:
1. Review duplicate cases in validation output
2. Add disambiguation logic in resolver
3. Check vote_key generation for consistency

### Missing Text URLs

**Symptoms**: Resolved votes have empty `bill_text_urls`

**Causes**:
- BILLSTATUS files missing `<textVersions>` entries
- XML parsing error in `getBillTextUrls()`

**Solutions**:
1. Verify BILLSTATUS files have `<formats>` elements
2. Check XML parsing logs for errors
3. Review BILLSTATUS schema changes

## Migration Path

### Phase 1: Parallel Validation (Week 1-2)

Run both systems side-by-side:

```bash
export VOTE_SOURCE=dual
node scripts/ingest_first_party_votes.js ...
```

Compare results and iterate on resolution logic.

### Phase 2: Cutover (Week 3)

Switch to first-party only:

```bash
export VOTE_SOURCE=first_party
```

Monitor for any regressions.

### Phase 3: Deprecation (Week 4+)

Remove LegiScan code and credentials.

## Performance

**Expected performance** (on modern hardware):

- BILLSTATUS indexing: ~1000 files/second
- Vote resolution: ~500 votes/second
- Database upsert: ~1000 votes/second (batched)

**Memory usage**:
- BILLSTATUS index: ~50MB for 2 years of bills
- Vote resolution: ~1MB per 1000 votes

## Maintenance

### Weekly Tasks

1. Download new votes from House/Senate
2. Download new BILLSTATUS files
3. Run ingestion pipeline
4. Review unresolved votes

### Monthly Tasks

1. Archive old BILLSTATUS files
2. Review resolution statistics trends
3. Update motion canonicalization rules if needed

### Quarterly Tasks

1. Validate against congress.gov API
2. Review and refine acceptance thresholds
3. Performance profiling and optimization

## References

- [House Clerk EVS Documentation](https://clerk.house.gov/Votes)
- [Senate LIS Documentation](https://www.senate.gov/legislative/votes.htm)
- [Congress.gov Bulk Data](https://www.govinfo.gov/bulkdata)
- [BILLSTATUS XML Schema](https://github.com/usgpo/bill-status)

## Support

For issues or questions:
1. Review `VOTE_INGESTION_REVIEW.md` for technical details
2. Check validation output for specific failures
3. Review resolution log JSONL for debugging
4. Open GitHub issue with reproduction steps
