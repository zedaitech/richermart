-- Adds address and UPI payment fields to the store singleton.
-- Safe to run against an existing Neon deployment (IF NOT EXISTS guards).

ALTER TABLE store ADD COLUMN IF NOT EXISTS address           TEXT NOT NULL DEFAULT '';
ALTER TABLE store ADD COLUMN IF NOT EXISTS upi_id            TEXT NOT NULL DEFAULT '';
ALTER TABLE store ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT NOT NULL DEFAULT '';
