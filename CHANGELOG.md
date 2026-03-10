# Changelog

All notable changes to RepWatch are documented here.

## [Unreleased]

## [1.3.0] - 2026-03-10

### Added

- **Full Senate coverage** – All 100 senators and their roll call votes are now tracked alongside House members.
  - `scripts/ingest_senate_votes.js` – Daily pipeline for Senate XML roll calls covering bills, nominations, amendments, and procedural motions.
  - `scripts/backfill_senator_lis_ids.js` – One-time script to stamp LIS IDs onto existing senator records for vote matching.
  - `scripts/backfill_senate_vote_metadata.js` – Fast parallel script to enrich existing votes with `vote_title`, `document_text`, and `vote_result_text` from Senate.gov XML.
  - `scripts/ingest_state.js` – Now stores the full `external_ids` object (including `lis` ID) for senators so vote matching works correctly.
- **Issues for all Senate vote types** – Nominations, amendments, cloture motions, and procedural votes each get their own issue record with a descriptive title (e.g. "Confirmation: John Smith, of Texas, to be…") instead of a generic label.
- **AI summaries for Senate rolls** – `generate_ai_summaries_for_votes.js` extended to cover nomination and procedural vote issues, passing `vote_title` and `vote_result_text` as LLM context.
- **Daily dev DB sync** – `.github/workflows/daily-ingest-dev.yml` runs the full pipeline against `DEV_DB_URL` daily to keep local development in sync.

### Changed

- **Home page** – Senators now appear in search results grouped under "Your Senators" / "Your House Representative" section headers. Recent votes section is collapsible.
- **Representative page** – Vote list paginates at 25 per page with a "Load more (N remaining)" button. Senators display "Senator" instead of "At-Large". Vote titles now prefer `vote_metadata.vote_title`.
- **Weekly digest emails** – `send_daily_digest.js` now covers both chambers; senator subtitle shows state + "Senator" instead of district number.
- **`daily_ingest.js`** – Senate vote ingest added as Step 2 in the daily pipeline.
- **`fetch_bill_summaries.js`** – `--new` mode now excludes synthetic `senate-roll:` IDs and targets additional Senate-style stub title patterns.
- **`routes/api.js`** – Title fallback chain prefers `vote_metadata.vote_title` for all endpoints.
- **Data Sources page** – Updated to document all five sources (House Clerk, Senate.gov, Congress.gov API, congress-legislators, Census TIGERweb) and the full four-step daily pipeline.

## [1.1.0] - 2025-02-26

### Added

- **Weekly email digest** – Subscribers receive a weekly email (Sundays 6 PM UTC) with the last 5 House votes for each representative they follow.
- **Email notifications infrastructure**
  - `users` and `rep_subscriptions` tables for signup and preferences.
  - `notification_events` table for idempotent send tracking (one digest per user per day).
  - Subscribe/unsubscribe API and one-click unsubscribe link in emails.
- **Scripts**
  - `scripts/send_daily_digest.js` – Builds and sends digest emails via Resend.
  - `scripts/reset_digest_cursor.js` – Clears today’s digest events so the job can re-run (e.g. for testing).
  - `scripts/check_notification_tables.js` – Verifies notification tables exist.
- **GitHub Action** – `.github/workflows/notify-daily.yml` runs the weekly digest on schedule and via manual dispatch.
- **Migration** – `migrations/010_add_email_notifications_tables.sql` for users, rep_subscriptions, notification_events, notification_state.

### Changed

- Digest email content: bill titles capped at 72 characters; one-sentence summaries prefer AI content and skip Congress.gov boilerplate.
- App and API updates for subscription flow and representative/issue pages.

### Requirements for production digest

- Run migration `010_add_email_notifications_tables.sql` on the production database.
- Set GitHub secrets: `DATABASE_URL` (production), `RESEND_API_KEY`.
- Verify sending domain in Resend (e.g. `updates@updates.repwatch.co`).

---

[Unreleased]: https://github.com/legostarwars2010/RepWatch/compare/main...development
[1.1.0]: https://github.com/legostarwars2010/RepWatch/compare/v1.0.0...v1.1.0
