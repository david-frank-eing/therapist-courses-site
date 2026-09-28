-- Tasks added from a client/event card carry client_id / event_id so the card can list them.
-- No foreign keys: the live events table predates the dashboard migration and its id type
-- is not guaranteed to be UUID, and an FK type mismatch would abort the whole script.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS event_id TEXT;
NOTIFY pgrst, 'reload schema';
