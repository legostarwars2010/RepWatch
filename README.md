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

### Generate AI Summaries

After ingesting votes, generate AI summaries for bills:

```bash
node scripts/regenerate_summaries_with_medium.js

# Load to database
node scripts/upsert_votes_to_db.js \
  --votes data/derived/votes.jsonl
```

```

This generates short and medium-length AI summaries for all bills in the database.

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


