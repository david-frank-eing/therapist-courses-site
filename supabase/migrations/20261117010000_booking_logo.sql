-- ============================================================
-- 17/11/2026 - a therapist can put their own logo at the top of the public booking page.
-- One new column. Reading and writing are already covered by the existing rules on booking_profiles
-- (public read, owner write), so nothing else changes. Safe to run more than once. Nothing is deleted.
-- The last statement prints one check row: expect logo_column = 1.
-- ============================================================

ALTER TABLE public.booking_profiles ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';

SELECT count(*) AS logo_column
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'booking_profiles' AND column_name = 'logo_url';
