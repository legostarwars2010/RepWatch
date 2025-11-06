# Scripts Directory

This directory contains consolidated CLI scripts for the RepWatch project. All scripts here are either:
- Referenced in `package.json` scripts
- Used in CI/CD workflows
- Core data ingestion pipelines
- Essential maintenance tools

## Core Ingestion Scripts

### Data Ingestion
- **`ingest_issues.js`** - Import legislative issues from data sources
  ```bash
  npm run ingest:issues
  ```

- **`ingest_votes.js`** - Import congressional voting records
  ```bash
  npm run ingest:votes
  ```

- **`ingest_members_congress_legislators.js`** - Import legislator data
  ```bash
  npm run ingest:members
  ```

- **`ingest_bills_congressgov.js`** - Import bills from Congress.gov
  ```bash
  npm run ingest:bills
  ```

### Pipeline Scripts
- **`ingest_legiscan_full_pipeline.js`** - Full LegiScan data pipeline
- **`master_normalize_map_ingest.js`** - Master normalization and mapping pipeline
- **`normalize_diagnose_ingest.js`** - Normalize, diagnose, and ingest data

## Migration Scripts
- **`run_migrations.js`** - Run database migrations

## Maintenance Scripts
- **`db_counts.js`** - Display database record counts
- **`run_migration_004.js`** - Run specific migration

## Naming Conventions

Scripts follow these patterns:
- `ingest_*.js` - Data ingestion from external sources
- `populate_*.js` - Populate/update database records
- `resolve_*.js` - Resolve identifiers or mappings
- `run_*.js` - Execute operations or migrations

## Deprecated Scripts

Scripts moved to `/attic/` include:
- Debug scripts (prefix: `debug_`, `_`)
- Temporary scripts (prefix: `tmp_`)
- One-off diagnostics (prefix: `check_`, `inspect_`, `diag_`)
- Test variants (suffix: `_dry`, `_verbose`, `_test`)
- Export/dump utilities

See `/attic/README.md` for recovery instructions.

## Adding New Scripts

When adding a new script:

1. **Follow naming conventions** - Use clear prefixes (`ingest_`, `populate_`, etc.)
2. **Add to package.json** - Create a corresponding npm script if it's user-facing
3. **Document here** - Add it to the appropriate section in this README
4. **Include JSDoc** - Add proper documentation in the script itself
5. **Reference in code** - If it's part of a pipeline, reference it from other scripts

## Running Scripts

Most scripts can be run via npm:
```bash
npm run <script-name>
```

Or directly with Node:
```bash
node scripts/<script-name>.js [args]
```

## Environment Variables

Scripts may require environment variables. See `.env.example` for required configuration:
- `DATABASE_URL` - PostgreSQL connection string
- `CONGRESS_API_KEY` - Congress.gov API key
- `LEGISCAN_API_KEY` - LegiScan API key

## Dependencies

Scripts depend on:
- Node.js 16+
- PostgreSQL database
- Various npm packages (see `package.json`)

## Troubleshooting

If a script fails:
1. Check environment variables are set
2. Ensure database is running and accessible
3. Verify data files exist in `/data/`
4. Check logs for specific error messages

For more help, see the main project README.
