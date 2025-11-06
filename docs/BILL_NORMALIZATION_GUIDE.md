# Bill Identifier Normalization System

## Overview

The bill identifier normalization system provides a consistent way to reference bills across different data sources. It converts various bill formats into a single canonical format.

## Canonical Format

**Format:** `{billtype}{number}-{congress}`

**Examples:**
- `hr2766-118` - House bill 2766 in 118th Congress
- `s58-118` - Senate bill 58 in 118th Congress  
- `hjres5-119` - House Joint Resolution 5 in 119th Congress

## Supported Input Formats

The normalizer handles these common formats:

| Format | Example | Normalized |
|--------|---------|------------|
| House Clerk XML | `"H R 2766"` | `hr2766-118` |
| Congress.gov API | `type="HR"`, `number=2766` | `hr2766-118` |
| Legiscan | `"HB82"` | `hr82-119` |
| Standard format | `"H.R. 1234"` | `hr1234-118` |
| Compact format | `"hr2766"` | `hr2766` (no congress) |
| Already canonical | `"hr2766-118"` | `hr2766-118` |

## Bill Types Supported

| Type | Full Name | Canonical |
|------|-----------|-----------|
| HR, H.R., HB | House Bill | `hr` |
| S, SB | Senate Bill | `s` |
| HJRES, H.J.RES. | House Joint Resolution | `hjres` |
| SJRES, S.J.RES. | Senate Joint Resolution | `sjres` |
| HCONRES, H.CON.RES. | House Concurrent Resolution | `hconres` |
| SCONRES, S.CON.RES. | Senate Concurrent Resolution | `sconres` |
| HRES, H.RES. | House Resolution | `hres` |
| SRES, S.RES. | Senate Resolution | `sres` |

## Usage Examples

### JavaScript/Node.js

```javascript
const { normalizeBillId } = require('./lib/bill_id_normalizer');

// Basic normalization
const result = normalizeBillId('H R 2766', 118);
console.log(result);
// {
//   canonical: 'hr2766-118',
//   type: 'hr',
//   number: 2766,
//   congress: 118
// }

// From House vote XML
const { parseClerkHouseBill } = require('./lib/bill_id_normalizer');
const voteMetadata = {
  'legis-num': 'H R 2766',
  'congress': 118
};
const normalized = parseClerkHouseBill(voteMetadata);

// From Legiscan data
const { parseLegiscanBill } = require('./lib/bill_id_normalizer');
const legiscanBill = {
  bill_number: 'HB82',
  session: { session_name: '119th Congress' }
};
const normalized = parseLegiscanBill(legiscanBill);
```

### SQL Queries

```sql
-- Find bill by canonical ID
SELECT * FROM bill_identifiers 
WHERE canonical_bill_id = 'hr2766-118';

-- Find bill by raw identifier
SELECT * FROM bill_identifiers 
WHERE raw_identifier = 'HB82';

-- Find all bills in a congress
SELECT * FROM bill_identifiers 
WHERE congress = 118 
ORDER BY bill_type, bill_number;

-- Link votes to issues
SELECT v.*, i.title 
FROM wa_test_votes v
JOIN bill_identifiers bi ON v.canonical_bill_id = bi.canonical_bill_id
JOIN issues i ON i.canonical_bill_id = bi.canonical_bill_id
WHERE v.representative_id = 123;
```

## Database Schema

### bill_identifiers Table

```sql
CREATE TABLE bill_identifiers (
  id SERIAL PRIMARY KEY,
  canonical_bill_id TEXT UNIQUE NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  congress INTEGER,
  raw_identifier TEXT,
  source TEXT,
  bill_title TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `canonical_bill_id` - Fast lookup by canonical ID
- `raw_identifier` - Fast lookup by original format
- `(bill_type, bill_number, congress)` - Composite lookup

## Workflow for Washington State Pilot

### 1. Fetch Vote Data
```javascript
// From House clerk XML
const voteData = await fetchHouseVote(rollNumber, year);
const billInfo = parseClerkHouseBill(voteData['vote-metadata']);
// billInfo.canonical = 'hr2766-118'
```

### 2. Create or Lookup Bill Identifier
```javascript
// Check if bill identifier exists
let billId = await pool.query(
  'SELECT * FROM bill_identifiers WHERE canonical_bill_id = $1',
  [billInfo.canonical]
);

if (!billId.rows[0]) {
  // Create new bill identifier
  billId = await pool.query(`
    INSERT INTO bill_identifiers 
    (canonical_bill_id, bill_type, bill_number, congress, raw_identifier, source)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    billInfo.canonical,
    billInfo.type,
    billInfo.number,
    billInfo.congress,
    voteData['legis-num'],
    'clerk'
  ]);
}
```

### 3. Link Vote to Issue
```javascript
// Store vote with canonical bill ID
await pool.query(`
  INSERT INTO wa_test_votes 
  (representative_id, canonical_bill_id, vote, vote_date, roll_number, chamber)
  VALUES ($1, $2, $3, $4, $5, $6)
`, [repId, billInfo.canonical, 'Yea', date, rollNum, 'house']);

// Later, match to issue
const issue = await pool.query(`
  SELECT * FROM issues WHERE canonical_bill_id = $1
`, [billInfo.canonical]);
```

## Data Quality Checks

```sql
-- Bills without congress number
SELECT COUNT(*) FROM bill_identifiers WHERE congress IS NULL;

-- Duplicate canonical IDs (should be 0)
SELECT canonical_bill_id, COUNT(*) 
FROM bill_identifiers 
GROUP BY canonical_bill_id 
HAVING COUNT(*) > 1;

-- Bills by source
SELECT source, COUNT(*) 
FROM bill_identifiers 
GROUP BY source;

-- Orphan votes (votes without bill identifiers)
SELECT COUNT(*) 
FROM wa_test_votes v
LEFT JOIN bill_identifiers bi ON v.canonical_bill_id = bi.canonical_bill_id
WHERE bi.id IS NULL;
```

## Maintenance Scripts

### Populate from Legiscan cache
```bash
node scripts/populate_bill_identifiers.js
```

### Test normalization
```bash
node scripts/test_bill_lookup.js
```

### Update existing issues
```sql
UPDATE issues i
SET canonical_bill_id = bi.canonical_bill_id
FROM bill_identifiers bi
WHERE i.bill_id = bi.raw_identifier;
```

## Edge Cases

### Bills without Congress Number
- Store without congress: `hr2766` (less specific)
- Can be updated later when congress is determined

### Amendment Votes
- Link to parent bill canonical ID
- Store amendment info in `vote_metadata` column

### Non-Bill Votes
- Procedural votes (quorum, adjournment): `canonical_bill_id = NULL`
- Nominations: Use special format `nom-{name}-{congress}`

### Multiple Votes per Bill
- Same `canonical_bill_id`, different `roll_number`
- One bill can have: passage vote, amendment votes, recommit vote, etc.

## Performance

- **Current:** 1,000+ bill identifiers indexed
- **Lookup time:** < 1ms with indexes
- **Normalization:** < 1ms per bill reference
- **Batch inserts:** 100+ bills/second

## Status

✅ Normalization function tested and working  
✅ Database schema created  
✅ 1,000 bills from Legiscan imported  
✅ All tests passing  
⏳ Ready for vote ingestion with Washington State pilot

---

*Last updated: 2025-11-03*
