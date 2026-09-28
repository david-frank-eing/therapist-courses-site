-- Tasks added from a client/event card carry client_id / event_id so the card can list them.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
