# Changelog

All notable changes to RepWatch are documented here.

## [Unreleased]

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
