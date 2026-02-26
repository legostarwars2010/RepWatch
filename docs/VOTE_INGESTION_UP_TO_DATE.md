# Keeping House Votes Up to Date

This guide covers (1) **catching up** the database from an old state (e.g. September 2025) to today, and (2) **daily automatic ingestion** so votes stay current.

## Prerequisites

- PostgreSQL database with `votes` and `issues` tables (and `representatives` populated).
- Node 18+ with dependencies installed (`npm install`).
- `.env` with `DATABASE_URL` (and optional `DEV_DB_URL` for dev).

## 1. Backfill roll_call format (one-time)

Vote identities now include the calendar year so 2025 and 2026 roll numbers don’t collide. Run this **once** before catch-up if you have existing votes with the old `roll_call` format (`house-119-N`):

```bash
# Using psql or your DB client, run:
psql $DATABASE_URL -f migrations/009_backfill_roll_call_year.sql
```

Or run the SQL in `migrations/009_backfill_roll_call_year.sql` in your migration runner.

## 2. Catch up to today (one-time)

To bring the DB from an old cutoff (e.g. September 2025) up to the latest available votes (e.g. 2026-02-25):

```bash
node scripts/ingest_house_votes.js --catch-up
```

This will:

- Ingest **all** House votes for **2025** (from Clerk) that you don’t already have.
- Ingest **all** House votes for **2026** (from Clerk) that you don’t already have.
- Create **issues** for any votes that have a bill reference but no issue yet, and link those votes to issues.

After this, your DB is current with what’s on [clerk.house.gov](https://clerk.house.gov/evs/) for 2025 and 2026.

## 3. Daily automatic ingest

To keep the database updated every day, run the daily ingest script once per day.

### Option A: Cron (Linux / macOS / server)

```bash
# Edit crontab
crontab -e

# Run every day at 6:00 AM UTC (adjust time and path)
0 6 * * * cd /path/to/RepWatch && node scripts/daily_ingest.js
```

### Option B: Render Cron Job

1. In Render, add a **Cron Job** to your RepWatch service (or a new “background” service).
2. Set the build command to your usual install (e.g. `npm install`).
3. Set the run command to: `node scripts/daily_ingest.js`
4. Set the schedule (e.g. `0 6 * * *` for 6 AM UTC daily).
5. Add `DATABASE_URL` (and any other env vars the script needs) in the service’s environment.

### Option C: GitHub Actions

Create `.github/workflows/daily-ingest.yml`:

```yaml
name: Daily vote ingest
on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC daily
  workflow_dispatch:
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: node scripts/daily_ingest.js
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Add `DATABASE_URL` (and any other required vars) as repository secrets.

## Manual single-year runs

- **Current year, recent missing only (default):**  
  `node scripts/ingest_house_votes.js`  
  or  
  `node scripts/ingest_house_votes.js --year=2026`

- **All votes for a given year:**  
  `node scripts/ingest_house_votes.js --year=2026 --all`

- **Specific range (e.g. rolls 100–50 for 2025):**  
  `node scripts/ingest_house_votes.js --year=2025 --start-roll=100 --count=50`

## After ingestion

- **AI summaries:** Run your usual AI summary pipeline for new issues (e.g. `scripts/regenerate_summaries_with_medium.js` or your project’s equivalent).
- **Representatives:** If new members have been sworn in, update `data/legislators-current.yaml` and run your rep ingestion (e.g. `scripts/ingest_state.js` for the affected states or your full rep pipeline).
