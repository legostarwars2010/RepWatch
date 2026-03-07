-- Email notifications: users, rep subscriptions, and send log (idempotent)

BEGIN;

-- Basic user identity for notifications.
-- (No auth system yet; this is just enough to store an email + preferences.)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  unsub_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email),
  UNIQUE(unsub_token)
);

-- Subscriptions: which reps a user is watching, and how/when to notify.
CREATE TABLE IF NOT EXISTS rep_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  representative_id INTEGER NOT NULL REFERENCES representatives(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'daily', -- 'instant' | 'daily' | 'weekly'
  event_types JSONB NOT NULL DEFAULT '["new_vote"]'::jsonb,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, representative_id)
);

-- Log of notification events actually sent.
-- event_key is the idempotency key (prevents duplicate emails for the same event).
CREATE TABLE IF NOT EXISTS notification_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  representative_id INTEGER REFERENCES representatives(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- e.g. 'new_vote'
  event_key TEXT NOT NULL,  -- e.g. 'vote:house-119-2026-78:rep:123'
  payload JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_key)
);

-- Small KV table for cursors/state (e.g. last processed roll_call).
CREATE TABLE IF NOT EXISTS notification_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_rep_subscriptions_rep ON rep_subscriptions(representative_id);
CREATE INDEX IF NOT EXISTS idx_rep_subscriptions_user ON rep_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_sent ON notification_events(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_rep_created ON notification_events(representative_id, created_at DESC);

COMMIT;

