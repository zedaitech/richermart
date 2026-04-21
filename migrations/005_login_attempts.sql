-- Per-IP admin-login rate limit: 5 attempts / 5 minutes.
-- One row per IP; first_attempt_at anchors the rolling window.

CREATE TABLE IF NOT EXISTS login_attempts (
  ip                TEXT PRIMARY KEY,
  attempts          INTEGER NOT NULL DEFAULT 0,
  first_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
