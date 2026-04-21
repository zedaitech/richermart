-- Adds a column for the admin-uploaded UPI payment QR image URL.
-- Safe to run against existing deployments.

ALTER TABLE store ADD COLUMN IF NOT EXISTS upi_qr_image TEXT NOT NULL DEFAULT '';
