-- Adds a weekly hours schedule to the store singleton.
-- Shape: JSONB with 7 keys (mon..sun), each { open: "HH:MM", close: "HH:MM" } or { closed: true }.

ALTER TABLE store ADD COLUMN IF NOT EXISTS hours JSONB;
