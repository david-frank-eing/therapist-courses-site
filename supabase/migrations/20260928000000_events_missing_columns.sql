-- The live public.events table predates 20260620000000_carlos_dashboard.sql
-- (it was created for analytics tracking), so its CREATE TABLE never ran and
-- the DJ-event columns the dashboard sends are missing. Add them all.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'lead';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attendees TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS style TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hours TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Analytics rows have no DJ-event fields and DJ-event rows have no event_name,
-- so event_name must be nullable for DJ-event inserts to succeed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'event_name') THEN
    ALTER TABLE public.events ALTER COLUMN event_name DROP NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
