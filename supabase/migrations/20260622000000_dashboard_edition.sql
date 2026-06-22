-- Add edition column to dashboard_config
-- Values: 'full' (default, all features) | 'lite' (AI features hidden)
ALTER TABLE dashboard_config
  ADD COLUMN IF NOT EXISTS edition text NOT NULL DEFAULT 'full'
  CHECK (edition IN ('full', 'lite'));
