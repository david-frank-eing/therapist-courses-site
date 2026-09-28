-- Usage analytics (_track in app.js) get their own table instead of sharing public.events
-- with DJ events. Existing analytics rows are moved over.
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner usage_events" ON public.usage_events;
CREATE POLICY "Owner usage_events" ON public.usage_events USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

INSERT INTO public.usage_events (user_id, event_name, properties, created_at)
SELECT user_id, event_name, properties, COALESCE(created_at, now())
FROM public.events
WHERE event_name IS NOT NULL;

DELETE FROM public.events WHERE event_name IS NOT NULL;

NOTIFY pgrst, 'reload schema';
