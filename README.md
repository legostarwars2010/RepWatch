# RepWatch

**Track what your U.S. House Representatives have been voting on.**

RepWatch lets you search by address or representative name to see recent congressional votes with AI-powered summaries explaining what each bill does and what a YES or NO vote means.

## Features

- 🏛️ **526 U.S. House Representatives** - All 50 states + DC
- 📍 **Address Lookup** - Find your rep by entering your address or ZIP code
- 🔍 **Name Search** - Look up any representative by name
- 📊 **Recent Votes** - See up to 50 recent votes per representative
- 🤖 **AI Summaries** - Clear explanations of what each bill does
- 📱 **Mobile Friendly** - Responsive design for all devices
- 🎨 **Minimal OLED Design** - Pure black background, easy on the eyes

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Neon)
- **AI**: OpenAI GPT-3.5-turbo for bill summaries
- **Data Sources**: House Clerk EVS, Senate XML, Congress.gov
- **Frontend**: Vanilla JavaScript, no frameworks

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (Neon recommended)
- OpenAI API key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/RepWatch.git
   cd RepWatch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials:
   ```
   DATABASE_URL=postgresql://...
   OPENAI_API_KEY=sk-...
   PORT=8080
   ```

4. **Run database migrations:**
   ```bash
   node scripts/run_migrations.js
   ```

5. **Start the server:**
   ```bash
   node server.js
   ```

6. **Open in browser:**
   ```
   http://localhost:8080
   ```

## Data Ingestion

### Keeping House Votes Up to Date (catch-up + daily)

For new bills to appear in the app with **real titles and AI summaries**, the pipeline must run in full (votes → Congress.gov titles → AI summaries). If your database is behind, see **[docs/VOTE_INGESTION_UP_TO_DATE.md](docs/VOTE_INGESTION_UP_TO_DATE.md)**.

- **One-time catch-up** (votes only): `npm run ingest:catch-up`
- **Full daily pipeline** (votes + bill titles + AI summaries): `npm run ingest:daily`  
  **To run once a day automatically:** see **[docs/VOTE_INGESTION_UP_TO_DATE.md](docs/VOTE_INGESTION_UP_TO_DATE.md)** for cron (Linux/macOS), Windows Task Scheduler, GitHub Actions, or Render. Requires **CONGRESS_API_KEY** and your **LLM config** for summaries.
- **Votes only** (skip titles/summaries): `node scripts/daily_ingest.js --votes-only`

### Testing on dev

With `NODE_ENV=development` in `.env`, scripts use **DEV_DB_URL** (see `db/pool.js`). Run from the repo root so `.env` is loaded.

1. **If dev DB has no representatives:** ingest one state first:
   ```bash
   node scripts/ingest_state.js --state=CA
   ```
2. **Small pipeline test** (10 rolls, 10 titles, 10 summaries):
   ```bash
   npm run ingest:dev
   ```
3. **Full daily pipeline** (all new rolls for current year, then titles + summaries):
   ```bash
   npm run ingest:daily
   ```
4. **Verify:** Start the app (`npm run dev:server` or `npm start`), hit `/api/lookup?address=...` or `/api/issues`, and confirm bills show real titles and AI summaries.

### Ingest State Data

To populate the database with representatives and votes for a specific state:

```bash
node scripts/ingest_state.js --state=CA
```

This will:
1. Import House representatives from `legislators-current.yaml`
2. Fetch recent votes from state vote data
3. Create issue records for bills
4. Link votes to representatives

### Bill titles and AI summaries (required for display)

The daily pipeline (`npm run ingest:daily`) runs these automatically:

1. **Bill titles** — `scripts/fetch_bill_summaries.js --new` fetches real titles and CRS summaries from Congress.gov (replaces motion text like "On Passage").
2. **AI summaries** — `scripts/generate_ai_summaries_for_votes.js` generates `ai_summary` for issues that have title/description/bill_summary.

To run them manually after a vote ingest:  
`node scripts/fetch_bill_summaries.js --new --limit=50` then  
`node scripts/generate_ai_summaries_for_votes.js --limit=50`.

## Scheduled tasks (GitHub Actions)

- **Weekly digest emails** (`.github/workflows/notify-daily.yml`)  
  Runs **Sundays at 6:00 PM UTC** and sends one digest per subscriber with their reps’ last 5 House votes. Also runnable manually via **Actions → Weekly digest emails → Run workflow**.  
  **Secrets required:** `DATABASE_URL` (production), `RESEND_API_KEY`. See [CHANGELOG.md](CHANGELOG.md) for setup.

- **Daily ingest** (`.github/workflows/daily-ingest.yml`)  
  Runs daily to refresh votes and summaries. Requires `DATABASE_URL`, `CONGRESS_API_KEY`, `OPENAI_API_KEY`.

## API Endpoints

### Lookup by Address
```bash
GET /api/lookup?address=1600+Pennsylvania+Ave+Washington+DC
```

Returns representatives for the given address with their recent votes.

### Lookup by Name
```bash
GET /api/lookup-by-name?name=Nancy+Pelosi
```

Returns representatives matching the search name with their recent votes.

## Project Structure

```
RepWatch/
├── public/              # Frontend files
│   ├── index.html       # Main landing page
│   ├── css/             # Stylesheets
│   └── js/              # Client-side JavaScript
├── routes/              # API routes
├── services/            # Business logic
│   ├── district_resolver.js  # Address → District
│   └── llm_wrappers.js        # AI summary generation
├── models/              # Database models
├── scripts/             # Data ingestion scripts
├── data/                # Data files
└── db/                  # Database setup
```

## Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete deployment instructions to:
- Render (recommended)
- Railway
- Fly.io
- Vercel

## Environment Variables

```bash
DATABASE_URL=postgresql://...        # PostgreSQL connection string
OPENAI_API_KEY=sk-...                # OpenAI API key
RESEND_API_KEY=re_...                # Resend API key (weekly digest emails)
NODE_ENV=production                  # Environment mode
PORT=8080                            # Server port
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Data Sources

- **House Votes**: Office of the Clerk, U.S. House of Representatives
- **Senate Votes**: U.S. Senate
- **Legislator Data**: unitedstates/congress-legislators
- **Bill Data**: Congress.gov


